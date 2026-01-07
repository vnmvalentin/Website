import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const RETURN_KEY = "twitchReturnTo";

export default function AuthTwitch() {
  const navigate = useNavigate();

  useEffect(() => {
    // Gemerkte Ziel-URL holen (z.B. /WinChallenge oder /poll)
    const returnTo = sessionStorage.getItem(RETURN_KEY) || "/";
    sessionStorage.removeItem(RETURN_KEY);

    // kurze Verzögerung, damit TwitchAuthContext den Hash auswertet
    const timer = setTimeout(() => {
      navigate(returnTo, { replace: true });
    }, 500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="text-center text-white mt-20">
      <h2>Twitch-Login wird verarbeitet...</h2>
    </div>
  );
}
