/**
 * ServiceCallback — OAuth redirect handler for service integrations.
 *
 * After Google/GitHub login, the user is redirected here:
 *  - Google implicit flow:  /services/callback#access_token=...&state=drive|calendar
 *  - GitHub code flow:      /services/callback?code=...&state=github
 *
 * This page:
 * 1. Parses the token/code from URL
 * 2. Sends it to the backend via POST /services/{provider}/token
 * 3. Notifies the parent window (if popup) or redirects home
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { storeServiceToken } from "@/lib/api/services";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type CallbackState = "processing" | "success" | "error";

const ServiceCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<CallbackState>("processing");
  const [message, setMessage] = useState("Processing login...");

  useEffect(() => {
    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCallback() {
    try {
      // --- Parse URL fragment (Google implicit flow) ---
      const hash = window.location.hash.substring(1); // remove '#'
      const fragmentParams = new URLSearchParams(hash);
      const accessToken = fragmentParams.get("access_token");
      const fragmentState = fragmentParams.get("state"); // e.g. "drive" or "calendar"
      const expiresIn = fragmentParams.get("expires_in");
      const tokenType = fragmentParams.get("token_type");

      // --- Parse query params (GitHub code flow) ---
      const code = searchParams.get("code");
      const queryState = searchParams.get("state"); // e.g. "github"
      const error = searchParams.get("error");

      if (error) {
        setState("error");
        setMessage(`Login failed: ${error}`);
        return;
      }

      // Google implicit flow: we have access_token in fragment
      if (accessToken && fragmentState) {
        const provider = fragmentState; // "drive" or "calendar"
        setMessage(`Storing ${provider} token...`);

        await storeServiceToken(provider, {
          access_token: accessToken,
          expires_in: expiresIn ? parseInt(expiresIn) : undefined,
          token_type: tokenType || "bearer",
        });

        setState("success");
        setMessage(`${provider === "drive" ? "Google Drive" : "Google Calendar"} connected!`);

        // Notify parent and redirect
        notifyAndRedirect();
        return;
      }

      // GitHub code flow: we have code in query  
      if (code && queryState === "github") {
        setMessage("Storing GitHub token...");

        // For now, store the code as access_token.
        // In production, the backend should exchange code for token.
        await storeServiceToken("github", {
          access_token: code,
          token_type: "code", // signal to backend this needs exchange
        });

        setState("success");
        setMessage("GitHub connected!");

        notifyAndRedirect();
        return;
      }

      // No recognizable params
      setState("error");
      setMessage("No authentication data received. Please try again.");
    } catch (err) {
      console.error("OAuth callback error:", err);
      setState("error");
      setMessage(err instanceof Error ? err.message : "Failed to save authentication");
    }
  }

  function notifyAndRedirect() {
    // Set flag so useServices can detect the change and refresh
    localStorage.setItem("kael-service-connected", Date.now().toString());

    // If opened as popup, try to close and notify opener
    if (window.opener) {
      try {
        window.opener.postMessage({ type: "kael-service-connected" }, "*");
      } catch {
        // ignore cross-origin
      }
      setTimeout(() => window.close(), 1500);
      return;
    }

    // Otherwise redirect home after a brief success message
    setTimeout(() => navigate("/", { replace: true }), 2000);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <div className="glass p-8 rounded-2xl max-w-sm w-full text-center space-y-4">
        {state === "processing" && (
          <Loader2 className="w-12 h-12 mx-auto text-neon-purple animate-spin" />
        )}
        {state === "success" && (
          <CheckCircle2 className="w-12 h-12 mx-auto text-green-400" />
        )}
        {state === "error" && (
          <AlertCircle className="w-12 h-12 mx-auto text-red-400" />
        )}

        <p className="text-lg font-medium text-foreground">{message}</p>

        {state === "error" && (
          <button
            onClick={() => navigate("/", { replace: true })}
            className="mt-4 px-6 py-2 bg-neon-purple/20 hover:bg-neon-purple/30 rounded-lg text-neon-purple transition-colors"
          >
            Back to Kael
          </button>
        )}

        {state === "success" && (
          <p className="text-xs text-muted-foreground">Redirecting...</p>
        )}
      </div>
    </div>
  );
};

export default ServiceCallback;
