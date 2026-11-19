export type FieldType = "boolean" | "number" | "range" | "select" | "text" | "custom";

export interface SelectOption {
  value: string;
  label: string;
}

export interface ConfigField<T = unknown> {
  type: FieldType;
  default: T;
  label?: string;
  hint?: string;
  section?: string;
  order?: number;
  hidden?: boolean;
  control?: string;
  options?: readonly SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  persist?: boolean;
  omitDefaultFromStorage?: boolean;
  parse?: (value: unknown) => T | undefined;
  validate?: (value: T, all: Readonly<Record<string, any>>) => string | null;
  visibleWhen?: (all: Readonly<Record<string, any>>) => boolean;
  disabledWhen?: (all: Readonly<Record<string, any>>) => boolean;
}

export type ConfigFields<T extends Record<string, any>> = {
  [K in keyof T]: ConfigField<T[K]>;
};

export interface ConfigDefinition<T extends Record<string, any>> {
  key: string;
  version: number;
  fields: ConfigFields<T>;
  area?: "local" | "session";
  write?: "diff" | "full";
  migrations?: Record<number, (value: Record<string, any>) => Record<string, any>>;
}

export interface ConfigChange<T extends Record<string, any>, K extends keyof T = keyof T> {
  key: K;
  value: T[K];
  previous: T[K];
  source: "load" | "set" | "patch" | "reset" | "import" | "storage";
}

export interface ConfigStore<T extends Record<string, any>> {
  readonly key: string;
  readonly version: number;
  readonly available: boolean;
  readonly lastError: Error | null;
  readonly definition: ConfigDefinition<T>;
  get(): Readonly<T>;
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): boolean;
  patch(value: Partial<T>): void;
  reset(key?: keyof T): void;
  clear(): void;
  flush(): void;
  subscribe(listener: (change: ConfigChange<T>) => void, keys?: readonly (keyof T)[]): () => void;
  export(): { version: number; data: T };
  import(value: unknown): { ok: boolean; errors: string[] };
  dispose(): void;
}

export interface ConfigImportResult {
  ok: boolean;
  errors: string[];
}
