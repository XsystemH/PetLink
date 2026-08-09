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
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
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
                var parentThread = new Thread(new ThreadStart(delegate { WatchParent(parentPid); })) { IsBackground = true, Name = "PetLink parent watcher" };
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
                    App.Dispatcher.BeginInvoke(new Action(delegate { Apply(command); }));
                }
                catch (Exception error)
                {
                    Emit(new Dictionary<string, object> { { "type", "native-error" }, { "message", error.Message } });
                }
            }
            App.Dispatcher.BeginInvoke(new Action(delegate { App.Shutdown(); }));
        }

        private static void Apply(Dictionary<string, object> command)
        {
            var type = ValueReader.Text(command, "type");
            if (type == "upsert")
            {
                var petId = ValueReader.Text(command, "petId");
                PetWindow pet;
                if (!Pets.TryGetValue(petId, out pet))
                {
                    pet = new PetWindow(petId, Emit);
                    pet.Closed += delegate { Pets.Remove(petId); };
                    Pets.Add(petId, pet);
                }
                pet.UpdatePet(
                    ValueReader.Item(command, "layers"),
                    ValueReader.Item(command, "animations"),
                    Convert.ToInt64(ValueReader.Number(command, "packageRevision", 0)),
                    ValueReader.Number(command, "x", 0.5),
                    ValueReader.Number(command, "y", 0.9),
                    ValueReader.Number(command, "scale", 1.0),
                    ValueReader.Text(command, "action", "idle"),
                    ValueReader.Text(command, "direction", "right"),
                    ValueReader.Bool(command, "isOwner", false));
                pet.ShowPet();
            }
            else if (type == "hide-others")
            {
                var visible = new HashSet<string>(ValueReader.StringList(command, "petIds"));
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
                catch
                {
                    App.Dispatcher.BeginInvoke(new Action(delegate { App.Shutdown(); }));
                    return;
                }
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
    }

    internal static class ValueReader
    {
        internal static object Item(Dictionary<string, object> value, string key)
        {
            object item;
            return value != null && value.TryGetValue(key, out item) ? item : null;
        }

        internal static string Text(Dictionary<string, object> value, string key, string fallback = "")
        {
            var item = Item(value, key);
            return item != null ? Convert.ToString(item) : fallback;
        }

        internal static double Number(Dictionary<string, object> value, string key, double fallback)
        {
            var item = Item(value, key);
            if (item == null) return fallback;
            try { return Convert.ToDouble(item); }
            catch { return fallback; }
        }

        internal static bool Bool(Dictionary<string, object> value, string key, bool fallback)
        {
            var item = Item(value, key);
            if (item == null) return fallback;
            try { return Convert.ToBoolean(item); }
            catch { return fallback; }
        }

        internal static Dictionary<string, object> Dictionary(object value)
        {
            return value as Dictionary<string, object>;
        }

        internal static IEnumerable<object> Items(object value)
        {
            var values = value as IEnumerable;
            if (values == null || value is string) yield break;
            foreach (var item in values) yield return item;
        }

        internal static IEnumerable<string> StringList(Dictionary<string, object> value, string key)
        {
            foreach (var entry in Items(Item(value, key))) if (entry != null) yield return Convert.ToString(entry);
        }
    }

    internal sealed class PetWindow : Window
    {
        private readonly string petId;
        private readonly Action<Dictionary<string, object>> emit;
        private readonly Grid directionGrid = new Grid { Background = Brushes.Transparent };
        private readonly Grid rootGrid = new Grid();
        private readonly ScaleTransform directionTransform = new ScaleTransform(1, 1);
        private readonly BoneTransform rootTransform = new BoneTransform();
        private readonly Dictionary<string, BoneVisual> visuals = new Dictionary<string, BoneVisual>();
        private readonly Dictionary<string, AnimationClip> animations = new Dictionary<string, AnimationClip>();
        private readonly DispatcherTimer animationTimer;
        private bool dragging;
        private bool isOwner;
        private bool awaitingDragAck;
        private string action = "idle";
        private DateTime actionStarted = DateTime.UtcNow;
        private DateTime lastDragPositionEmit = DateTime.MinValue;
        private DateTime suppressRemotePositionUntil = DateTime.MinValue;
        private double targetLeft;
        private double targetTop;
        private double pendingDragLeft;
        private double pendingDragTop;
        private long packageRevision = -1;

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

            directionGrid.RenderTransformOrigin = new Point(0.5, 0.5);
            directionGrid.RenderTransform = directionTransform;
            rootGrid.RenderTransformOrigin = new Point(0.5, 0.92);
            rootGrid.RenderTransform = rootTransform.Group;
            directionGrid.Children.Add(rootGrid);
            Content = directionGrid;

            MouseLeftButtonDown += BeginDrag;
            MouseRightButtonUp += OpenMenu;
            MouseDoubleClick += delegate { Emit("interact"); };
            LocationChanged += delegate
            {
                if (!dragging) return;
                var now = DateTime.UtcNow;
                if ((now - lastDragPositionEmit).TotalMilliseconds < 50) return;
                lastDragPositionEmit = now;
                EmitPosition("drag-move");
            };

            animationTimer = new DispatcherTimer(DispatcherPriority.Render) { Interval = TimeSpan.FromMilliseconds(33) };
            animationTimer.Tick += Animate;
            animationTimer.Start();
        }

        internal void UpdatePet(
            object rawLayers,
            object rawAnimations,
            long nextPackageRevision,
            double x,
            double y,
            double scale,
            string nextAction,
            string direction,
            bool owner)
        {
            isOwner = owner;
            if (packageRevision != nextPackageRevision)
            {
                LoadLayers(rawLayers);
                LoadAnimations(rawAnimations);
                packageRevision = nextPackageRevision;
            }

            var nextSize = 220.0 * Clamp(scale, 0.5, 2.0);
            Width = nextSize;
            Height = nextSize;
            var area = SystemParameters.WorkArea;
            var remoteLeft = area.Left + Clamp(x, 0, 1) * area.Width - nextSize / 2.0;
            var remoteTop = area.Top + Clamp(y, 0, 1) * area.Height - nextSize * 0.78;

            if (awaitingDragAck)
            {
                var matchesFinal = nextAction != "dragged" && Distance(remoteLeft, remoteTop, pendingDragLeft, pendingDragTop) < 4;
                if (matchesFinal)
                {
                    awaitingDragAck = false;
                    targetLeft = remoteLeft;
                    targetTop = remoteTop;
                    Left = remoteLeft;
                    Top = remoteTop;
                }
                else if (DateTime.UtcNow < suppressRemotePositionUntil)
                {
                    targetLeft = pendingDragLeft;
                    targetTop = pendingDragTop;
                }
                else
                {
                    awaitingDragAck = false;
                }
            }

            if (!dragging && !awaitingDragAck)
            {
                targetLeft = remoteLeft;
                targetTop = remoteTop;
                if (nextAction != "move" || !IsVisible)
                {
                    Left = remoteLeft;
                    Top = remoteTop;
                }
            }

            if (action != nextAction)
            {
                action = nextAction;
                actionStarted = DateTime.UtcNow;
            }
            directionTransform.ScaleX = direction == "left" ? -1 : 1;
        }

        internal void ShowPet()
        {
            if (!IsVisible) Show();
            Topmost = true;
        }

        private void LoadLayers(object rawLayers)
        {
            rootGrid.Children.Clear();
            visuals.Clear();
            var hasVisibleLayer = false;
            foreach (var rawLayer in ValueReader.Items(rawLayers))
            {
                var layer = ValueReader.Dictionary(rawLayer);
                if (layer == null) continue;
                var bone = ValueReader.Text(layer, "bone");
                var imageDataUrl = ValueReader.Text(layer, "imageDataUrl");
                if (String.IsNullOrEmpty(bone) || String.IsNullOrEmpty(imageDataUrl)) continue;
                var source = DecodeImage(imageDataUrl);
                var isVisible = HasVisiblePixels(source);
                hasVisibleLayer = hasVisibleLayer || isVisible;
                var visual = new BoneVisual(
                    bone,
                    source,
                    ValueReader.Number(layer, "pivotX", 0.5),
                    ValueReader.Number(layer, "pivotY", 0.5));
                Canvas.SetZIndex(visual.Image, Convert.ToInt32(ValueReader.Number(layer, "zIndex", 0)));
                rootGrid.Children.Add(visual.Image);
                visuals[bone] = visual;
            }
            if (!hasVisibleLayer)
            {
                rootGrid.Children.Clear();
                visuals.Clear();
                var fallback = new BoneVisual("head", CreateFallbackPet(), 0.5, 0.45);
                rootGrid.Children.Add(fallback.Image);
                visuals["head"] = fallback;
            }
        }

        private void LoadAnimations(object rawAnimations)
        {
            animations.Clear();
            var values = ValueReader.Dictionary(rawAnimations);
            if (values == null) return;
            foreach (var pair in values)
            {
                var value = ValueReader.Dictionary(pair.Value);
                if (value == null) continue;
                var clip = new AnimationClip
                {
                    DurationMs = Math.Max(100, ValueReader.Number(value, "durationMs", 1000)),
                    Loop = ValueReader.Bool(value, "loop", true),
                };
                var tracks = ValueReader.Dictionary(ValueReader.Item(value, "tracks"));
                if (tracks != null)
                {
                    foreach (var track in tracks)
                    {
                        var frames = new List<Keyframe>();
                        foreach (var rawFrame in ValueReader.Items(track.Value))
                        {
                            var frame = ValueReader.Dictionary(rawFrame);
                            if (frame == null) continue;
                            frames.Add(new Keyframe
                            {
                                At = Clamp(ValueReader.Number(frame, "at", 0), 0, 1),
                                X = ValueReader.Number(frame, "x", 0),
                                Y = ValueReader.Number(frame, "y", 0),
                                Rotation = ValueReader.Number(frame, "rotation", 0),
                                ScaleX = ValueReader.Number(frame, "scaleX", 1),
                                ScaleY = ValueReader.Number(frame, "scaleY", 1),
                            });
                        }
                        frames.Sort(delegate(Keyframe left, Keyframe right) { return left.At.CompareTo(right.At); });
                        if (frames.Count > 0) clip.Tracks[track.Key] = frames;
                    }
                }
                animations[pair.Key] = clip;
            }
        }

        private void BeginDrag(object sender, MouseButtonEventArgs args)
        {
            if (args.ChangedButton != MouseButton.Left) return;
            dragging = true;
            lastDragPositionEmit = DateTime.MinValue;
            Emit("drag-start");
            try { DragMove(); }
            catch { }
            finally
            {
                dragging = false;
                pendingDragLeft = Left;
                pendingDragTop = Top;
                targetLeft = Left;
                targetTop = Top;
                awaitingDragAck = true;
                suppressRemotePositionUntil = DateTime.UtcNow.AddSeconds(1.8);
                EmitPosition("drag-end");
            }
        }

        private void OpenMenu(object sender, MouseButtonEventArgs args)
        {
            args.Handled = true;
            var menu = new ContextMenu();
            menu.Items.Add(MenuItem("互动", delegate { Emit("interact"); }));
            if (isOwner)
            {
                menu.Items.Add(MenuItem("待机", delegate { EmitAction("idle"); }));
                menu.Items.Add(MenuItem("走动", delegate { EmitAction("move"); }));
                menu.Items.Add(MenuItem("睡觉", delegate { EmitAction("sleep"); }));
            }
            menu.Items.Add(new Separator());
            menu.Items.Add(MenuItem("打开设置", delegate { Emit("open-settings"); }));
            menu.IsOpen = true;
        }

        private MenuItem MenuItem(string title, Action onClick)
        {
            var item = new MenuItem { Header = title };
            item.Click += delegate { onClick(); };
            return item;
        }

        private void Animate(object sender, EventArgs args)
        {
            var moving = false;
            if (!dragging && action == "move")
            {
                var distance = Distance(Left, Top, targetLeft, targetTop);
                if (distance > 0.75)
                {
                    Left += (targetLeft - Left) * 0.16;
                    Top += (targetTop - Top) * 0.16;
                    moving = true;
                }
                else
                {
                    Left = targetLeft;
                    Top = targetTop;
                }
            }

            var visualAction = action;
            if (visualAction == "dragged") visualAction = "idle";
            if (visualAction == "visiting") visualAction = "interact";
            if (visualAction == "move" && !moving) visualAction = "idle";

            AnimationClip clip;
            if (!animations.TryGetValue(visualAction, out clip) && !animations.TryGetValue("idle", out clip))
            {
                ApplyNeutralPose();
                return;
            }
            var elapsed = (DateTime.UtcNow - actionStarted).TotalMilliseconds;
            var progress = clip.Loop
                ? (elapsed % clip.DurationMs) / clip.DurationMs
                : Math.Min(1, elapsed / clip.DurationMs);
            ApplyNeutralPose();
            foreach (var track in clip.Tracks)
            {
                var sampled = Sample(track.Value, progress);
                if (track.Key == "root") rootTransform.Apply(sampled, Width, Height);
                else
                {
                    BoneVisual visual;
                    if (visuals.TryGetValue(track.Key, out visual)) visual.Transform.Apply(sampled, Width, Height);
                }
            }
        }

        private void ApplyNeutralPose()
        {
            rootTransform.Reset();
            foreach (var visual in visuals.Values) visual.Transform.Reset();
        }

        private static Keyframe Sample(List<Keyframe> frames, double progress)
        {
            if (frames.Count == 1 || progress <= frames[0].At) return frames[0];
            for (var index = 1; index < frames.Count; index += 1)
            {
                var right = frames[index];
                if (progress > right.At) continue;
                var left = frames[index - 1];
                var span = Math.Max(0.0001, right.At - left.At);
                var amount = (progress - left.At) / span;
                return Keyframe.Lerp(left, right, amount);
            }
            return frames[frames.Count - 1];
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
                return bitmap;
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
                if (pixels[index] > 96 && ++visible > 512) return true;
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
                drawing.DrawRoundedRectangle(body, null, new Rect(166, 222, 180, 225), 90, 90);
                drawing.DrawRoundedRectangle(body, null, new Rect(112, 254, 76, 178), 38, 38);
                drawing.DrawRoundedRectangle(body, null, new Rect(324, 254, 76, 178), 38, 38);
                drawing.DrawRoundedRectangle(dark, null, new Rect(174, 374, 78, 125), 39, 39);
                drawing.DrawRoundedRectangle(dark, null, new Rect(260, 374, 78, 125), 39, 39);
                drawing.DrawGeometry(head, null, Geometry.Parse("M156,47 C132,96 132,153 162,171 Q195,181 225,154 C205,108 181,70 156,47"));
                drawing.DrawGeometry(head, null, Geometry.Parse("M356,47 C380,96 380,153 350,171 Q317,181 287,154 C307,108 331,70 356,47"));
                drawing.DrawEllipse(head, null, new Point(256, 191), 130, 115);
                drawing.DrawEllipse(dark, null, new Point(212, 194), 13, 13);
                drawing.DrawEllipse(dark, null, new Point(300, 194), 13, 13);
            }
            var bitmap = new RenderTargetBitmap(512, 512, 96, 96, PixelFormats.Pbgra32);
            bitmap.Render(visual);
            bitmap.Freeze();
            return bitmap;
        }

        private static double Distance(double leftX, double leftY, double rightX, double rightY)
        {
            var x = leftX - rightX;
            var y = leftY - rightY;
            return Math.Sqrt(x * x + y * y);
        }

        private static double Clamp(double value, double minimum, double maximum)
        {
            return Math.Max(minimum, Math.Min(maximum, value));
        }
    }

    internal sealed class BoneVisual
    {
        internal readonly Image Image;
        internal readonly BoneTransform Transform = new BoneTransform();

        internal BoneVisual(string bone, BitmapSource source, double pivotX, double pivotY)
        {
            Image = new Image
            {
                Source = source,
                Stretch = Stretch.Uniform,
                RenderTransformOrigin = new Point(pivotX, pivotY),
                RenderTransform = Transform.Group,
                IsHitTestVisible = false,
            };
        }
    }

    internal sealed class BoneTransform
    {
        internal readonly TransformGroup Group = new TransformGroup();
        private readonly ScaleTransform scale = new ScaleTransform(1, 1);
        private readonly RotateTransform rotation = new RotateTransform(0);
        private readonly TranslateTransform translation = new TranslateTransform(0, 0);

        internal BoneTransform()
        {
            Group.Children.Add(scale);
            Group.Children.Add(rotation);
            Group.Children.Add(translation);
        }

        internal void Apply(Keyframe frame, double width, double height)
        {
            scale.ScaleX = frame.ScaleX;
            scale.ScaleY = frame.ScaleY;
            rotation.Angle = frame.Rotation;
            translation.X = frame.X * width;
            translation.Y = frame.Y * height;
        }

        internal void Reset()
        {
            scale.ScaleX = 1;
            scale.ScaleY = 1;
            rotation.Angle = 0;
            translation.X = 0;
            translation.Y = 0;
        }
    }

    internal sealed class AnimationClip
    {
        internal double DurationMs = 1000;
        internal bool Loop = true;
        internal readonly Dictionary<string, List<Keyframe>> Tracks = new Dictionary<string, List<Keyframe>>();
    }

    internal sealed class Keyframe
    {
        internal double At;
        internal double X;
        internal double Y;
        internal double Rotation;
        internal double ScaleX = 1;
        internal double ScaleY = 1;

        internal static Keyframe Lerp(Keyframe left, Keyframe right, double amount)
        {
            return new Keyframe
            {
                At = left.At + (right.At - left.At) * amount,
                X = left.X + (right.X - left.X) * amount,
                Y = left.Y + (right.Y - left.Y) * amount,
                Rotation = left.Rotation + (right.Rotation - left.Rotation) * amount,
                ScaleX = left.ScaleX + (right.ScaleX - left.ScaleX) * amount,
                ScaleY = left.ScaleY + (right.ScaleY - left.ScaleY) * amount,
            };
        }
    }
}
