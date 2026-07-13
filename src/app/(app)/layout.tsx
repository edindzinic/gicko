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

  return (
    <div className="flex min-h-screen flex-1 flex-col sm:flex-row">
      <Nav />
      <main className="flex-1 overflow-y-auto bg-neutral-50 pb-16 sm:pb-0 dark:bg-black">
        {children}
      </main>
    </div>
  );
}
