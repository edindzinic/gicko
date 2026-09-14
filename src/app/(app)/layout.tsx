import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";
import { ReminderBanner } from "@/components/ReminderBanner";

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
      {/* Bottom padding clears the fixed tab bar, which is itself lifted off the home
          indicator, so the last card is never under either. */}
      <main className="flex-1 overflow-y-auto bg-neutral-50 pb-[calc(4rem+max(0.5rem,env(safe-area-inset-bottom)))] sm:pb-0 dark:bg-black">
        {/* Above every screen, not just Home: a nap falls due while you're on the calendar
            as readily as anywhere else. */}
        <ReminderBanner />
        {children}
      </main>
    </div>
  );
}
