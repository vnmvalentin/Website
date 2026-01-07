import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PollRenderer from "../../components/PollRenderer";

export default function AbstimmungDetail() {
  const { id } = useParams();
  const [poll, setPoll] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/polls/${id}`, { credentials: "include" });
        if (!res.ok) {
          setPoll(null);
          return;
        }
        const data = await res.json();
        setPoll(data || null);
      } catch (e) {
        console.error(e);
        setPoll(null);
      }
    })();
  }, [id]);

  if (!poll) return <p>Abstimmung nicht gefunden</p>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-extrabold mb-4">{poll.title}</h1>

      {poll.questions?.length ? (
        <PollRenderer poll={poll} />
      ) : (
        <p>Kein Formular oder Fragen hinterlegt.</p>
      )}

      <Link to="/Abstimmungen" className="mt-6 inline-block px-4 py-2 bg-blue-600 rounded">
        Zurück
      </Link>
    </div>
  );
}
