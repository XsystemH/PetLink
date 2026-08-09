using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace PetLink.NativeHost
{
    internal static class Program
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
        private static readonly Dictionary<string, PetWindow> Pets = new Dictionary<string, PetWindow>();
        private static readonly object OutputLock = new object();
        private static Application App;

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main(string[] args)
        {
            SetProcessDPIAware();
            int parentPid = 0;
            if (args.Length > 0) int.TryParse(args[0], out parentPid);
            App = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };

            var inputThread = new Thread(ReadCommands) { IsBackground = true, Name = "PetLink command reader" };
            inputThread.Start();
            if (parentPid > 0)
            {
                var parentThread = new Thread(() => WatchParent(parentPid)) { IsBackground = true, Name = "PetLink parent watcher" };
                parentThread.Start();
            }
            App.Run();
        }

        private static void ReadCommands()
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                try
                {
                    var command = Json.Deserialize<Dictionary<string, object>>(line);
                    App.Dispatcher.BeginInvoke(new Action(() => Apply(command)));
                }
                catch (Exception error)
                {
                    Emit(new Dictionary<string, object> { { "type", "native-error" }, { "message", error.Message } });
                }
            }
            App.Dispatcher.BeginInvoke(new Action(() => App.Shutdown()));
        }

        private static void Apply(Dictionary<string, object> command)
        {
            var type = Text(command, "type");
            if (type == "upsert")
            {
                var petId = Text(command, "petId");
                PetWindow pet;
                if (!Pets.TryGetValue(petId, out pet))
                {
                    pet = new PetWindow(petId, Emit);
                    pet.Closed += (sender, args) => Pets.Remove(petId);
                    Pets.Add(petId, pet);
                }
                pet.UpdatePet(
                    Text(command, "imageDataUrl"),
                    Number(command, "x", 0.5),
                    Number(command, "y", 0.9),
                    Number(command, "scale", 1.0),
                    Text(command, "action", "idle"),
                    Text(command, "direction", "right"),
                    Bool(command, "isOwner", false));
                pet.ShowPet();
            }
            else if (type == "hide-others")
            {
                var visible = new HashSet<string>(StringList(command, "petIds"));
                foreach (var pair in Pets) if (!visible.Contains(pair.Key)) pair.Value.Hide();
            }
            else if (type == "show-all")
            {
                foreach (var pet in Pets.Values) pet.ShowPet();
            }
            else if (type == "hide-all")
            {
                foreach (var pet in Pets.Values) pet.Hide();
            }
            else if (type == "quit")
            {
                foreach (var pet in new List<PetWindow>(Pets.Values)) pet.Close();
                App.Shutdown();
            }
        }

        private static void WatchParent(int parentPid)
        {
            while (true)
            {
                Thread.Sleep(1500);
                try { Process.GetProcessById(parentPid); }
                catch { App.Dispatcher.BeginInvoke(new Action(() => App.Shutdown())); return; }
            }
        }

        private static void Emit(Dictionary<string, object> message)
        {
            lock (OutputLock)
            {
                Console.WriteLine(Json.Serialize(message));
                Console.Out.Flush();
            }
        }

        private static string Text(Dictionary<string, object> value, string key, string fallback = "")
        {
            object item;
            return value.TryGetValue(key, out item) && item != null ? Convert.ToString(item) : fallback;
        }

        private static double Number(Dictionary<string, object> value, string key, double fallback)
        {
            object item;
            if (!value.TryGetValue(key, out item) || item == null) return fallback;
            try { return Convert.ToDouble(item); } catch { return fallback; }
        }

        private static bool Bool(Dictionary<string, object> value, string key, bool fallback)
        {
            object item;
            if (!value.TryGetValue(key, out item) || item == null) return fallback;
            try { return Convert.ToBoolean(item); } catch { return fallback; }
        }

        private static IEnumerable<string> StringList(Dictionary<string, object> value, string key)
        {
            object item;
            if (!value.TryGetValue(key, out item) || item == null) yield break;
            var list = item as IEnumerable;
            if (list == null) yield break;
            foreach (var entry in list) if (entry != null) yield return Convert.ToString(entry);
        }
    }

    internal sealed class PetWindow : Window
    {
        private readonly string petId;
        private readonly Action<Dictionary<string, object>> emit;
        private readonly Image image;
        private readonly ScaleTransform directionTransform = new ScaleTransform(1, 1);
        private readonly RotateTransform rotationTransform = new RotateTransform(0);
        private readonly TranslateTransform animationTransform = new TranslateTransform(0, 0);
        private readonly DispatcherTimer animationTimer;
        private bool dragging;
        private bool isOwner;
        private string action = "idle";
        private DateTime actionStarted = DateTime.UtcNow;
        private double targetLeft;
        private double targetTop;
        private string lastImage = "";

        internal PetWindow(string petId, Action<Dictionary<string, object>> emit)
        {
            this.petId = petId;
            this.emit = emit;
            Title = "PetLink 桌宠";
            Width = 220;
            Height = 220;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;
            SnapsToDevicePixels = true;

            var transforms = new TransformGroup();
            transforms.Children.Add(directionTransform);
            transforms.Children.Add(rotationTransform);
            transforms.Children.Add(animationTransform);
            image = new Image
            {
                Stretch = Stretch.Uniform,
                RenderTransformOrigin = new Point(0.5, 0.72),
                RenderTransform = transforms,
                IsHitTestVisible = true
            };
            Content = image;

            MouseLeftButtonDown += BeginDrag;
            MouseRightButtonUp += OpenMenu;
            MouseDoubleClick += (sender, args) => Emit("interact");
            LocationChanged += (sender, args) => { if (dragging) EmitPosition("drag-move"); };

            animationTimer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(33) };
            animationTimer.Tick += Animate;
            animationTimer.Start();
        }

        internal void UpdatePet(string imageDataUrl, double x, double y, double scale, string nextAction, string direction, bool owner)
        {
            isOwner = owner;
            var nextSize = 220.0 * Clamp(scale, 0.5, 2.0);
            Width = nextSize;
            Height = nextSize;
            var area = SystemParameters.WorkArea;
            targetLeft = area.Left + Clamp(x, 0, 1) * area.Width - nextSize / 2.0;
            targetTop = area.Top + Clamp(y, 0, 1) * area.Height - nextSize * 0.78;
            if (!dragging && (nextAction != "move" || !IsVisible))
            {
                Left = targetLeft;
                Top = targetTop;
            }
            if (action != nextAction)
            {
                action = nextAction;
                actionStarted = DateTime.UtcNow;
            }
            directionTransform.ScaleX = direction == "left" ? -1 : 1;
            if (!String.IsNullOrEmpty(imageDataUrl) && imageDataUrl != lastImage)
            {
                image.Source = DecodeImage(imageDataUrl);
                lastImage = imageDataUrl;
            }
        }

        internal void ShowPet()
        {
            if (!IsVisible) Show();
            Topmost = true;
        }

        private void BeginDrag(object sender, MouseButtonEventArgs args)
        {
            if (args.ChangedButton != MouseButton.Left) return;
            dragging = true;
            Emit("drag-start");
            try { DragMove(); }
            catch { }
            finally
            {
                dragging = false;
                targetLeft = Left;
                targetTop = Top;
                EmitPosition("drag-end");
            }
        }

        private void OpenMenu(object sender, MouseButtonEventArgs args)
        {
            args.Handled = true;
            var menu = new ContextMenu();
            menu.Items.Add(MenuItem("互动", () => Emit("interact")));
            if (isOwner)
            {
                menu.Items.Add(MenuItem("待机", () => EmitAction("idle")));
                menu.Items.Add(MenuItem("走动", () => EmitAction("move")));
                menu.Items.Add(MenuItem("睡觉", () => EmitAction("sleep")));
            }
            menu.Items.Add(new Separator());
            menu.Items.Add(MenuItem("打开设置", () => Emit("open-settings")));
            menu.IsOpen = true;
        }

        private MenuItem MenuItem(string title, Action onClick)
        {
            var item = new MenuItem { Header = title };
            item.Click += (sender, args) => onClick();
            return item;
        }

        private void Animate(object sender, EventArgs args)
        {
            var elapsed = (DateTime.UtcNow - actionStarted).TotalMilliseconds;
            if (!dragging && action == "move")
            {
                Left += (targetLeft - Left) * 0.16;
                Top += (targetTop - Top) * 0.16;
            }
            if (action == "sleep")
            {
                rotationTransform.Angle = -8;
                animationTransform.Y = 5 + Math.Sin(elapsed / 550.0) * 2;
            }
            else if (action == "move")
            {
                rotationTransform.Angle = Math.Sin(elapsed / 120.0) * 3;
                animationTransform.Y = -Math.Abs(Math.Sin(elapsed / 150.0)) * 7;
            }
            else if (action == "interact")
            {
                var progress = Math.Min(1, elapsed / 700.0);
                rotationTransform.Angle = Math.Sin(progress * Math.PI * 4) * (1 - progress) * 10;
                animationTransform.Y = -Math.Sin(progress * Math.PI) * 18;
                if (progress >= 1) action = "idle";
            }
            else
            {
                rotationTransform.Angle = Math.Sin(elapsed / 700.0) * 1.5;
                animationTransform.Y = Math.Sin(elapsed / 520.0) * 2;
            }
        }

        private void Emit(string type)
        {
            emit(new Dictionary<string, object> { { "type", type }, { "petId", petId } });
        }

        private void EmitAction(string nextAction)
        {
            emit(new Dictionary<string, object> { { "type", "set-action" }, { "action", nextAction } });
        }

        private void EmitPosition(string type)
        {
            var area = SystemParameters.WorkArea;
            var x = Clamp((Left + Width / 2.0 - area.Left) / area.Width, 0, 1);
            var y = Clamp((Top + Height * 0.78 - area.Top) / area.Height, 0, 1);
            emit(new Dictionary<string, object>
            {
                { "type", type },
                { "petId", petId },
                { "position", new Dictionary<string, object> { { "x", x }, { "y", y } } }
            });
        }

        private static BitmapSource DecodeImage(string dataUrl)
        {
            var comma = dataUrl.IndexOf(',');
            var payload = comma >= 0 ? dataUrl.Substring(comma + 1) : dataUrl;
            var bytes = Convert.FromBase64String(payload);
            using (var stream = new MemoryStream(bytes))
            {
                var bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.StreamSource = stream;
                bitmap.EndInit();
                bitmap.Freeze();
                return HasVisiblePixels(bitmap) ? bitmap : CreateFallbackPet();
            }
        }

        private static bool HasVisiblePixels(BitmapSource source)
        {
            var converted = new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);
            var stride = converted.PixelWidth * 4;
            var pixels = new byte[stride * converted.PixelHeight];
            converted.CopyPixels(pixels, stride, 0);
            var visible = 0;
            for (var index = 3; index < pixels.Length; index += 4)
            {
                if (pixels[index] > 24 && ++visible > 64) return true;
            }
            return false;
        }

        private static BitmapSource CreateFallbackPet()
        {
            var visual = new DrawingVisual();
            using (var drawing = visual.RenderOpen())
            {
                var body = new SolidColorBrush(Color.FromRgb(202, 151, 214));
                var head = new SolidColorBrush(Color.FromRgb(226, 183, 232));
                var dark = new SolidColorBrush(Color.FromRgb(56, 45, 66));
                drawing.DrawEllipse(body, null, new Point(256, 355), 115, 120);
                drawing.DrawEllipse(body, null, new Point(205, 444), 53, 25);
                drawing.DrawEllipse(body, null, new Point(307, 444), 53, 25);
                drawing.DrawGeometry(head, null, Geometry.Parse("M145,126 L187,43 L230,111 Z"));
                drawing.DrawGeometry(head, null, Geometry.Parse("M282,111 L325,43 L367,126 Z"));
                drawing.DrawEllipse(head, null, new Point(256, 210), 126, 122);
                drawing.DrawEllipse(dark, null, new Point(212, 208), 13, 16);
                drawing.DrawEllipse(dark, null, new Point(300, 208), 13, 16);
                var mouth = new Pen(dark, 9) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
                drawing.DrawLine(mouth, new Point(230, 248), new Point(256, 263));
                drawing.DrawLine(mouth, new Point(256, 263), new Point(282, 248));
            }
            var bitmap = new RenderTargetBitmap(512, 512, 96, 96, PixelFormats.Pbgra32);
            bitmap.Render(visual);
            bitmap.Freeze();
            return bitmap;
        }

        private static double Clamp(double value, double minimum, double maximum)
        {
            return Math.Max(minimum, Math.Min(maximum, value));
        }
    }
}
