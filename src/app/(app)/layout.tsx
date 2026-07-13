import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-screen flex-1 flex-col sm:flex-row">
      <Nav displayName={profile?.display_name ?? "Account"} />
      <main className="flex-1 overflow-y-auto bg-stone-50 pb-16 sm:pb-0 dark:bg-stone-950">
        {children}
      </main>
    </div>
  );
}
