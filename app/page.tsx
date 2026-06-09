// The home page is a traffic director:
//   - Not logged in?       -> send to /login
//   - Logged-in instructor -> send to /instructor
//   - Logged-in student    -> send to /student
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "instructor") {
    redirect("/instructor");
  }
  redirect("/student");
}
