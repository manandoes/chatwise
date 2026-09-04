import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/signup-form";
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
  title: "Create your account",
};

export default async function SignUpPage(props: PageProps<"/signup">) {
  const searchParams = await props.searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h2">Create your account</CardTitle>
        <CardDescription>
          Get your WhatsApp agent answering customers in a few minutes.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <SignUpForm
          next={safeRedirectPath(searchParams.next)}
          isGoogleEnabled={isGoogleSignInEnabled}
        />
      </CardContent>
    </Card>
  );
}
