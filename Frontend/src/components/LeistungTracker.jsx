// LeistungTracker.jsx — gibt Seitenwechsel innerhalb der App an die Leistungsmessung weiter (utils/leistungMessung.js).
// Steht in App.jsx neben AnalyticsTracker; rendert nichts.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { seitenwechsel } from "../utils/leistungMessung";

export default function LeistungTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    seitenwechsel(pathname);
  }, [pathname]);
  return null;
}
