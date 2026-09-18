import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { CenteredShell, Card, Eyebrow, Headline, Sub } from "@/components/ui";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.appRole === "ADMIN" ? "/admin" : "/brief");
  }

  return (
    <CenteredShell>
      <Eyebrow>User Flow Quest</Eyebrow>
      <Headline>Masuk ke portal</Headline>
      <Sub>
        Gunakan email &amp; password yang diberikan mentor/admin kamu. Peserta dan admin masuk
        lewat halaman yang sama — tampilan menyesuaikan otomatis.
      </Sub>
      <Card>
        <LoginForm />
      </Card>
    </CenteredShell>
  );
}
