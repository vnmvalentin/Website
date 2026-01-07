// BingoJoinPage.jsx
import React, { useContext, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { joinByKey } from "../../utils/bingoApi";

export default function BingoJoinPage() {
  const { joinKey } = useParams();
  const navigate = useNavigate();
  const { user, login, authLoaded } = useContext(TwitchAuthContext); 
  // HINWEIS: Falls dein Context "authLoaded" oder "loading" nicht exportiert, 
  // wird unten der Fallback greifen.

  const [error, setError] = useState("");
  const [status, setStatus] = useState("checking"); // checking -> joining | needLogin
  const attemptRef = useRef(false);

  useEffect(() => {
    let t;
    
    const tryJoin = async () => {
      // Wenn User da ist -> Join
      if (user) {
        setStatus("joining");
        try {
          const json = await joinByKey(joinKey);
          navigate(`/Bingo/${json.sessionId}`);
        } catch (e) {
          setError(e.message || "Join fehlgeschlagen");
          setStatus("error");
        }
        return;
      }

      // Wenn kein User da ist:
      // Wir warten kurz ab, ob der Auth-Provider den User noch lädt.
      // Oft ist "user" beim ersten Render null, wird aber 100ms später gesetzt.
      // Wenn authLoaded (vom Context) existiert, nutzen wir das, sonst Timeout.
      
      const isDefinitelyLoggedOut = authLoaded === true && !user;
      
      if (isDefinitelyLoggedOut) {
         setStatus("needLogin");
         if (!attemptRef.current) {
            attemptRef.current = true;
            login?.();
         }
      } else {
         // Fallback: Kurz warten, dann Login triggern, wenn immer noch nichts da ist
         t = setTimeout(() => {
            if (!user) {
              setStatus("needLogin");
              if (!attemptRef.current) {
                attemptRef.current = true;
                login?.();
              }
            }
         }, 800); // 800ms Puffer für Auth-Check
      }
    };

    tryJoin();

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinKey, user, authLoaded]);

  return (
    <div className="relative z-10 max-w-xl mx-auto rounded-2xl bg-black/60 border border-white/10 p-5">
      <h1 className="text-2xl font-bold">Bingo Session beitreten</h1>

      {status === "checking" && (
        <div className="mt-3 text-white/70">
          Überprüfe Zugang...
        </div>
      )}

      {status === "needLogin" && (
        <div className="mt-3 text-white/70">
          Login wird gestartet...
        </div>
      )}

      {status === "joining" && (
        <div className="mt-3 text-white/70">Joine...</div>
      )}

      {status === "error" && (
        <div className="mt-3 text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}