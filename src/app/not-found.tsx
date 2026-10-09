import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, primaryActionClass } from "@/components/shell/status-screen";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusScreen
      icon={Compass}
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist, was moved, or you don't have access to it."
      actions={
        <Link href="/dashboard" className={primaryActionClass}>
          Go to dashboard
        </Link>
      }
    />
  );
}
