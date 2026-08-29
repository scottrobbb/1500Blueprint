import { redirect } from "next/navigation";

// Pricing is the public entry point. Authenticated students continue into Ultimate.
export default function Home() {
  redirect("/pricing");
}
