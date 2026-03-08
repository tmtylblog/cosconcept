import { redirect } from "next/navigation";

export default function Home() {
  // Root URL goes straight to the chat/dashboard experience
  redirect("/dashboard");
}
