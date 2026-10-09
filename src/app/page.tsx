import { redirect } from "next/navigation";
import { HOME_PATH } from "@/lib/navigation";

export default function RootPage(): never {
  redirect(HOME_PATH);
}
