import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PetPackage, RoomAccess } from "@petlink/protocol";
import { petPackageSchema } from "@petlink/protocol";

interface PersistedUser {
  displayName: string;
  access: RoomAccess;
  petRevision: number;
}

interface PersistedState {
  users: Record<string, PersistedUser>;
}

export class FileStore {
  readonly statePath: string;
  readonly petDir: string;

  constructor(private readonly dataDir: string) {
    this.statePath = path.join(dataDir, "state.json");
    this.petDir = path.join(dataDir, "pets");
  }

  async initialize() {
    await mkdir(this.petDir, { recursive: true });
  }

  async loadState(): Promise<PersistedState> {
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as PersistedState;
    } catch {
      return { users: {} };
    }
  }

  async saveState(state: PersistedState) {
    await this.initialize();
    const temporary = `${this.statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
    await rename(temporary, this.statePath);
  }

  async savePet(userId: string, petPackage: PetPackage) {
    const parsed = petPackageSchema.parse(petPackage);
    await this.initialize();
    const destination = path.join(this.petDir, `${userId}.json`);
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, JSON.stringify(parsed), "utf8");
    await rename(temporary, destination);
  }

  async loadPet(userId: string): Promise<PetPackage | null> {
    try {
      const raw = JSON.parse(await readFile(path.join(this.petDir, `${userId}.json`), "utf8"));
      return petPackageSchema.parse(raw);
    } catch {
      return null;
    }
  }
}

export type { PersistedState };
