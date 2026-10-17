import { redirect } from "next/navigation";

/** The front door is Today. */
export default function Home() {
  redirect("/today");
}
