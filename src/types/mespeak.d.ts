declare module "mespeak" {
  export interface MespeakOptions {
    v?: string;
    s?: number;
    p?: number;
    a?: number;
    g?: number;
    rawdata?: string;
  }

  export interface Mespeak {
    loadConfig(config: unknown): void;
    loadVoice(voice: unknown): void;
    setDefaultVoice(voice: string): void;
    speak(text: string, options?: MespeakOptions): Buffer;
  }

  const mespeak: Mespeak;
  export = mespeak;
}
