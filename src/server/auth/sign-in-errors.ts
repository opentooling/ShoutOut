/** Auth.js sends failed sign-ins here with ?error=<type>; details are in the server log. */
export function signInErrorMessage(error: string | string[] | undefined): string | null {
  if (typeof error !== "string" || !error) return null;
  if (error === "AccessDenied") return "Your account isn't allowed to sign in to ShoutOut.";
  if (error === "Configuration") {
    return 'Sign-in isn\'t working because of a server setup problem. An administrator can find the details in the ShoutOut server logs (scope "auth").';
  }
  return "Sign-in didn't complete. Please try again.";
}
