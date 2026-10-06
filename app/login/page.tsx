import { login } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="authShell">
    <form action={login} className="authCard">
      <p className="eyebrow">SECURE AI RAG</p>
      <h1>Sign in</h1>
      <p className="muted">Access your private knowledge base.</p>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="error">Invalid email or password.</p>}
      <button type="submit">Continue</button>
    </form>
  </main>;
}
