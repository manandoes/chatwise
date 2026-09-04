import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGoogleSignInEnabled } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/validation/auth";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h2">Welcome back</CardTitle>
        <CardDescription>
          Log in to manage your WhatsApp agent and conversations.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <LoginForm
          next={safeRedirectPath(searchParams.next)}
          isGoogleEnabled={isGoogleSignInEnabled}
          initialError={
            typeof searchParams.error === "string" ? searchParams.error : undefined
          }
        />
      </CardContent>
    </Card>
  );
}
