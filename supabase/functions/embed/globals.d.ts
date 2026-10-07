// Supabase Edge Functions expose the Supabase.ai namespace at runtime.
// This ambient declaration keeps the Next.js/TypeScript project checker from
// treating the Edge Runtime global as an application type error.
declare namespace Supabase {
  namespace ai {
    class Session {
      constructor(model: string);
      run(
        input: string,
        options?: { mean_pool?: boolean; normalize?: boolean },
      ): Promise<number[]>;
    }
  }
}
