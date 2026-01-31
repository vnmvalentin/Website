import React, { useContext, useState, useEffect, useCallback, useRef } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { useParams, useLocation } from "react-router-dom"; 
// NEU: Socket Client
import io from "socket.io-client";
import { 
  Fish, Monitor, Save, MessageSquare, Flag, Heart, Play, Sparkles, Copy, Check, RefreshCw, Award, Waves, Droplets, UserX, Sliders, Lock, Search, Crown, Shield, Terminal, Server, Download, LayoutDashboard, ChevronDown, ChevronRight, Image as ImageIcon, Shuffle, Zap
} from "lucide-react";

// --- KONSTANTEN ---
// !!! BITTE HIER DEINEN ECHTEN IMPORT STRING EINFÜGEN !!!
const SB_POND_IMPORT_CODE = `U0JBRR+LCAAAAAAABADtXVlvG0mSfh9g/gPbgIFdoNOurDsbGGBFmqRIyZRFiueqH/KqYol1cFhFStSgX/d1BvsH+mUf9kfMW/+h/gkbWTzE0+52t3pMrwzIZFXeEZERX0RGFf/25z8VCq8imdFX3xX+pi7gMqaRhMtX7+eF8sM4mWSvvl2W0Gk2TCaqbBZHMxrKOAvidelMTtIgiVUxfqO90dYFQqZ8EoyzZeFmd0lzGp/xZUk8DcNVWRTEQTSNOus+VaEq+yGv8UrQrTnTvI8U7vzn4k5hVZQXB0INLKmtScI95EnDQaY0TUS5oMgyMcambtiUkNXk8mZ/ncppTgpt+Q8d+G/1b6uljCkLpRo1m0zlVskDD6dCViZJdB6kWTKZQyWPhumxWh9kLILYP1RrxalSEkU0FpfQn9yahj9JpmNVoxPIezlpSbpVTMN7Ok+BBYc6n0CPSbRmzl45T2I+nUxABg6VZpPA94F5mxzZ4cqyl3zqtZxBuk4Notke0rCnIdNzbUQsz0Cmq7me1GxiMXNzARu8NTkmnnQEEoRzZOqehyixMLIsyl1mSkyFvtc0m48V/UwN75Yc5d8Td9KVwH2/WfrD08X3m/RIp+xsX0YPUSSTD4qir8pBLAs5SwtCTgpLHqcFL4hhQ2UFMS0MAzn5rjDMsnH63du3G3vyjZBvx0ks3i7Jm+4tfZrKYpIdWR9wM2SUj44ULyju2bojqWsh4XEXmSbTkasRjjTBpGtKgzPP2Rv2Xgb+UA0L+uEIN/BewZgqKctFZENF/EJeKWo9qAF/CZd4EoZ0nEpRVRtnm7s/rCse0CyO6Tk648jBwkKmRQxEHc9GTDiua1LMbWyfpGapBOmwNKSxf9J6hWFi6ko5WIIoxe9J5GIDIyw0bNuEWUSQI3rFoILZzHAR0U2KTAHKBTQJQ9R0bcfVKdEJPi298h+vYe9PXn9b8EGL0DBXL6Bq4gJsTak+ged8WPB++uekMI2haqEq73/6n1R9+7TC8UBg3r5mk4QKTtOsDa0aIEuvn0EBUYtww+QSCenYyMSmhigTJvJcYeoW0bnlsP8vCghMHKNSYmQbUpk/jSMipUCmoQvKbF0w7J6kAjoHntxMaBCXY3FiKmjBGUGYYwvHA854OnDGIYjZGDAoZraNdWw4jjimQACWfkEKZI8lrYxOssK/lZLxvKD/+94itmH/oY0zAU0MVOZyb+y8uPTd7W0Xtk9yn97evg/4JEkTL3vTKN/c3lYmMJv7ZDKyzdvbmQn+hqEZmNzeRilPJmHA3ogwfLXd5fe747N5JkuJyFcleo0xi7jfNsJHUe1kV/faxereTdQxRJVMuU4iUbIu4HN6OXoYs7jsvLtOGqW4iPvRw7g/L96xauWRz4vv2uVhncE9FrWhPG2UgjO/Virei249pd33fj8iM1YqVmS1cyd6zfCiNFrVWfSZf1/8tUYkoBHUKxVH/V5zWHun+QzmVCuPP/Sjcdg3rpOLm3SrjYT5r76v/gbVitbvpEG/29Bol0xroeZ/aJ0F9Dy8H/Sa8343nPb0znRQqqk5PLU91xolf7M/tT5/2tE7AdDijuod7Tquz/rd5l2/19DaRnNOu1Z8UW0ORbU87VTJjTivK1omh2k5mPEID8V5U9WZ3kRkOmiNxldbayjOYY6YR6YPfeHBer1F8u56vG+/xxMJIGAchPLAJl4KaEjnuRAfq5HSmWzKdBpmN0mHTgK19z5Wd6vWIYlf6gSAFJ5NAUpwBt6NsC1Aih7AE5thbLkWuDLW51guov49i/HCz2m8LN10AE0BqHKBCCbRbUSxAHIwAYTQdY8a7LSN10LITtF8GTomWFIAWZgBdCaEIWK4LsKOxaTlGobtHPWrseZ+eebr0B54sVT/Sku1bWm2y/K/3IpUWC2q3IlqOGNBXah+a9HQ4tWOxqPKmIUEaFGZixfLtdwXz2O5mCcNoRsMYZODzwU+ByJUuMhyGbV0R2Dd2Y/QfcWWC4PFshwHuUJqyLQMHRFsM+S4mGsWxS53vJO0XBdBmqrYz4nZrK2oDxFYeJbrAI6gWMWQAVa4rokokQzb1GHSto9EfVxuSebpKpQnGTI1DE6bqWOkSSo005au7h112r6sqM9suasbS8YuDkryq915zGi4kM0RMH+vVB3W3CxWeDwkY3DsAGV1pEsL0IJJPER0YiOhcdMyHc4J/iz1gHXjD4jJfPsxQr7Ah+eBDxum3p3V3pWntfJwxqptv9NrhDwoYhZd+62udS9611vQgC9Nda3amLEuHqp6H1oL894Es97UH2b9qJJ2osr8w3kDYEI4HTyaSS1a1w8AiviXc9dvQj12/t4fnLfBSe7AHJ76vIkq2aBr+v24PhTdRsKNI/M47zwOejU1hyGPxGN3Xsdc78zByd6CEbvw56k99K+FU37e0RS86ffqMZ9b75huacox51oWypYfANwxlvQILlpnb2sAewZGg9Xijfa7Y7bO7FqpFuzAksdlua+g0wBotqD5GVnV3eNPZTwedO+zJW9Cea6CBsPxoFcPWXCWDLqWNog6cxZf+9elIh10wzsK9Ly43hp3PIC6td6SJ3OrDsYSs+rDBz7qZPy8aV1s0OKiNfpkYGNv/hvtL8PGPauG2kWJ+/V5yN5XgDZq3S1/fBnWQ159GPb1dlIbnQWXpbOgFow+ASHPZpfzYg/WOq1Vs5CCbHSjMGQK8raKY5CPFHgSgLyEfX2Y04XpTUWv6qA7TIFWIE8PI5HLbpiBrCX93vV4a8xqGNVKwxV/pq1e40p0H9Ibo15hvaImW0NNyQfAyo6SMaCRz6OOJnr1aQ14IrrtPWiu5Px9YPrXUQf2fZixrpL1MKyVV7C6GAAEXvAS5L7f60QAvUPWKraBTzHQd74nD+UmBhrAPrEeF5D/vX8N8xJdHCoZgD7uaKmY9bsWhjUDXcKp6hNoUewbAJl104f5azLqTLdpvpKN4nBRz2rLXjHMYX+wA/HP9nhzzdMrdxC1faF3UsUDGA/2EVbzGAFvYF8KEIQrHXjlC6MzH4C+uaioMTtD1u3ML6P6DNbTBRqP+6DHBq0z4CUBmlWmg1J7vE+HSgq6dM6iikZ7fbtWaYTifKxoC3uzk6l9USuJ1Vqu+kCf+rw4BpqPlM5oG53gsr3mA+iZvl/XM5Cl9yAjJK9TN+pKTuMDcpLrm8sR6Ky4OQRd8tjSO9ZFqb41Hsj1GNa+GCNsguvU3tRV23U/obOAl4+D1gHeRPmcg6t5zodqH3gOOviOHtIl796Dnh3f3GigW6MKyIf5m13JwwHO7Xku5nYWUD0E+1XzF3vzTOnVu0GrdrA/sIPgvjXCZX+5Xt/RpfkcgY7LfXkd9FpKDzUVfUNRyW3DwT3ZKJl+WwVdqzt7oNy4bpUs0DP1R6Y3JrDXSzwiw0G1MQSbseZNPseW1WZ4tWeGV4Oe0GC90G6gXY7G8GlOmxGZg/xqwH+lc6+gPAS9saPr6iC3IMdBUeNxJ1yvUenAWPvLKbmqBreobgsdYZXjYzIGXppuCkSIgzUhsWRsP3L19bqqpit1SaWOTEnBc7d0cFVNV0fc8iSzTGJgTk/SVb2UWSEbSnVsPSy0xpKOTtlp1WxGqKeZyHZVHhO2XUSpwxEFacWaw7Fh73tuCw7nEQdsuEhS5kFTh4GsewJhh2i26Zmm5+wn5HyRTuuLr/XcvlaladBe847mdqkOfQ5mtWp9zvTKqK9X1Fznyt5e42LtMlzWLYMdK2/Xgf6dI7gt2LBVIR+Fo9yn2Qi1KkxTuwGbHndSVlJ+zHbfl+FiboPSk+9ywD62eRyeg20scrCFtTi3s4DjizPwj3Z9s92w7CIUfF63lL+ocCtgpnm/J+oMaC9KNcCrBD6f/CTAho9cr8SDhd3csuUUMNvF+Ud8mioOudEYDvT2+KJ1ICS8Haa+uNHrfx0AjlmGvwHzJAp7TAc9voGN/N015ThEtX3CdOYCi5TqEe01kh7MQbZ2MPR6jDGrRdt8aHWXWKa6d/94H0s+LDDQGvscGW9Nl+U46+s9Gi/kUYT9uDHr69m2PFbW+GdNA5Dd2TqkX7ZCYTQBIzdmg/h62oJPFlhVZtQzqK+pOpcjawZ7a/zRI4qF3L1nusj3zUXpOuji4oebUVMA7gfaFgH/NcCHaobiXeJLfbWeDtn3Lb8evEVc2+NY95BkJgG8RQzEdGYjm9g6o6bJhfzCjgaeNSOLGoZNGMBPYlALmbbAyHWFhQxN2raHPQnY9CTx1ockFk3KJRjRWE6+QKz1G/Mjf/7x7/9VeEfTQlPGKh0S6FaYJRMmg28Kr+/zRb8uDGlW8AEqqBrfFH7+8R8//vzjf//vcyQ5ghiZnusiT1DYVaZwETOIjbgkFgVHRvIDqatfa5Kjo3FigB/n5amNVLMQkURDrsN0W1OPdtjOSW4ptZ1O/bSNg//o2aYNSp87yHQ5RkwSggRhuicFccE3Oea4EGq5DJvI1KCVKTyiklc95BBJuSnBaWfuaTgun3PaNgHmf+ZpG7iH3MAOYhQceZNJIL4FxPN0yTROTZvr2stp24sH+HLa9nLa9nLa9nLa9nLa9nLa9nLa9nLa9iyJodzRKNEcpBEGvpkgOqKSYoSpy03TcVwqPuthvBM9bQNP1CaMWohbyqVxsUDEAi/e9gwbgLkpLFs7UVc1OLXn8KJAdY72/MSIPhy8vwxnYsMlnmciYavUXk5M9XSpi1xbw45GiLSIcfzBB+cLcko/9tzey1N7z+RePZnNhVnLDzasUMyfDnb2Ds+2oNWuu7Zl9nYPdtSTe6Oe0TDAHGa1uwPPUOSwidzncATcr6ug2FJtFNTJXa5WMaO95iPAt7E6WGHbh1Fkd54vpvP3M50WdzljwkG643BkMpMh12QScRtLwoim6WQ/T/3rNZ0u5cxydQdZhtDUW3psIAe1wQA6pnSoa2LXOEnT2RrSyahwlmUq5n9aJnQ70it1AYhOPa7JVdiRckQ0MJTMcgxpM9fUjr+lR6e24dgm8jT1XIVJOKJYXRLD0YRuEU87kUjvS4DyDwtQ7qSllMNyraqClp0pOOO50wvjTmm3kYDzqg969UB0rRE4uGmt+hAqC5fPTd8LjLWFHmpg8fKgTqtrRWw3bUUFt5ZpJsu65zvWDerspWCsA33b6S55KsteGkWtVFbIALPqvf9hb3xrObdr/wqc5tyy7wXHzuaXQZHSbidd0eXTaTIbwcvg3mcGfD4FgTZSYI6m96wcb/X+gOEqqHo5Ch9vVDpPmcybXXwvzkfJRgB1XHvn+hvXnwoMHlnzIqD5sTFXAcpfHKibq6BAmMEcQpCli7ZGroBPQ9HNZexDq2xVAGWFIupMRanmC6M+5OdF4M/oo0EUhfR+cSClDW3D/XczcF0FnDJPpahA2WQX3W213ZO3xZOye/ffHe9jRbtl8GXF54N0+82BFDVm8DshwrP91K6bKokX+9of1cLs+kazyr1W8YbCGul8J03HWAaPzrVg79BgX4by+x7oE+/6LyeFNg3peZxbYLgtlyKTErDjlk4RczRsmq5m2ZJ/WWjzt+cULL6s6i8A41aqyKv1e/KOvEByLCdRkGVSqBda7WeZrIs3Rt8sDz7r9Yabb2Hjw9KBV/ltUHAP2wVxDk4PFUUL269tEzDvXg33jafGW964ndzG6sbu9bpCultjcWN1oQp2b/DtTIeJ9OVD+WEcBjzISnScTScHpx0mnC5R1dbUAz9OJirR5ozzZBofyLdZVqnFmZzENDxQIU2mkwUewzuMTQH/l1S3cnJoUssaSi4+UovTVLZknAZZMDu4Nj9MGA1LSRIC7Ntb4TTv/XDZJ7wHHzyEbJlKsN5Jh/2v30XIf+279p5eYpq/ZnAvDebZJHz4JMnq24tEfq0S+WvfA/DxlyA8jzyqR+5zeRz99M80lS/S+NVK4699wGfrVawtOv8j7H9K5y8C+LUK4K9N1Px4lurzCKDKiczV4STPwX4Rxq9WGH9lLHk7mH4glv5MClGN9iKF/1opXHxZu+z3kqUJH8msJSezHQl8KiyFgYyz7cIsiFb11Z3lL0o8/XzFMv35lcx//UIKdb7zavmrFktp3P99isVvXiAajof0DX715z/98H9aW+e2XWMAAA==`;

const FISH_TYPES = [
  { id: "goldfish", name: "Goldfisch", img: "/assets/viewerpond/goldfish/goldfish.png" },
  { id: "clownfish", name: "Nemo", img: "/assets/viewerpond/clownfish/clownfish.png" },
  { id: "stripedfish", name: "Gill", img: "/assets/viewerpond/stripedfish/stripedfish.png" },
  { id: "puffer", name: "Kugelfisch", img: "/assets/viewerpond/puffer/puffer.png" },
  { id: "seahorse", name: "Seepferdchen", img: "/assets/viewerpond/seahorse/seahorse.png" },
  { id: "jellyfish", name: "Qualle", img: "/assets/viewerpond/jellyfish/jellyfish.png" },
  { id: "turtle", name: "Schildkröte", img: "/assets/viewerpond/turtle/turtle.png" },
  { id: "sharky", name: "Baby Hai", img: "/assets/viewerpond/babyshark/babyshark.png" },
  { id: "dolphin", name: "Delphin", img: "/assets/viewerpond/dolphin/dolphin.png" },
  { id: "whale", name: "Wal", img: "/assets/viewerpond/whale/whale.png" },
];

// NEU: Command Liste
const COMMAND_LIST = [
    { cmd: "!shark [user]", desc: "Lässt den Hai auf den User los", icon: <Fish size={14} /> },
    { cmd: "!say [msg]", desc: "Dein Fisch gibt die Nachricht aus", icon: <MessageSquare size={14} /> },
    { cmd: "!race [user]", desc: "Starte ein Rennen gegen den Nutzer", icon: <Flag size={14} /> },
    { cmd: "!kiss [user]", desc: "Küsse den User", icon: <Heart size={14} /> },
    { cmd: "!fish", desc: "Link zum Ändern des Fisches", icon: <Check size={14} /> },
];

// NEU: Verfügbare Dekorationen
const DECO_OPTIONS = [
    { id: "seaweed_1", name: "Seetang Hoch", img: "/assets/viewerpond/decorations/seaweed_tall.png" },
    { id: "seaweed_2", name: "Seetang Busch", img: "/assets/viewerpond/decorations/seaweed_bush.png" },
    { id: "rock_1", name: "Felsen", img: "/assets/viewerpond/decorations/rock1.png" },
    { id: "rock_2", name: "Steinhaufen", img: "/assets/viewerpond/decorations/rock2.png" },
    { id: "ship", name: "Schiffswrack", img: "/assets/viewerpond/decorations/shipwreck.png" },
];

const ROLES = [
    { id: "sub", label: "Subscriber" },
    { id: "vip", label: "VIP" },
    { id: "mod", label: "Moderator" },
];

const DEFAULT_BOTS = "nightbot,streamlabs,streamelements,moobot,wizebot,fossabot,soundalerts";
// --- HELPER ---

// --- HELPER: Socket ---
// Verbindung zum Backend aufbauen (Port anpassen wenn nötig)
const socket = io(window.location.origin, { path: "/socket.io", autoConnect: false });

// --- HELPER: Debounce Hook ---
// Verhindert, dass bei jeder Millisekunde Slider-Bewegung ein Request gesendet wird
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

const RangeControl = ({ label, value, min, max, step, onChange, unit = "" }) => (
    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
        <div className="flex justify-between mb-2">
            <span className="text-xs text-white/60 font-medium">{label}</span>
            <span className="text-xs text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">{value}{unit}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400" />
    </div>
);

const RoleBadges = ({ reqs }) => {
    if (!reqs || reqs.length === 0 || reqs.includes("all")) return null;

    return (
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-20">
            {reqs.includes("mod") && (
                <div className="bg-green-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm backdrop-blur-sm">
                    <Shield size={10} /> MOD
                </div>
            )}
            {reqs.includes("vip") && (
                <div className="bg-pink-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm backdrop-blur-sm">
                    <Crown size={10} /> VIP
                </div>
            )}
            {reqs.includes("sub") && (
                <div className="bg-purple-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm backdrop-blur-sm">
                    <Award size={10} /> SUB
                </div>
            )}
        </div>
    );
};

const Toggle = ({ label, checked, onChange }) => (
    <label className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-black/30 transition-colors">
        <span className="text-sm text-white font-medium">{label}</span>
        <div className={`w-10 h-6 rounded-full p-1 transition-colors ${checked ? "bg-cyan-600" : "bg-white/10"}`}><div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : ""}`} /></div>
        <input type="checkbox" className="hidden" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
);

const PositionToggle = ({ value, onChange }) => (
    <div className="bg-black/20 p-3 rounded-xl border border-white/5 flex items-center justify-between">
        <span className="text-sm text-white font-medium">Position</span>
        <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
            <button 
                onClick={() => onChange("top")}
                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${value === "top" ? "bg-cyan-600 text-white shadow" : "text-white/40 hover:text-white"}`}
            >
                Oben
            </button>
            <button 
                onClick={() => onChange("bottom")}
                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${value === "bottom" ? "bg-cyan-600 text-white shadow" : "text-white/40 hover:text-white"}`}
            >
                Unten
            </button>
        </div>
    </div>
);


const RoleMultiSelect = ({ selected = [], onChange }) => {
    const currentSelected = Array.isArray(selected) ? selected : ["all"];
    const isAll = currentSelected.includes("all");

    const toggleRole = (roleId) => {
        let newSelection;
        if (roleId === 'all') {
            newSelection = ['all'];
        } else {
            if (isAll) {
                newSelection = [roleId];
            } else {
                if (currentSelected.includes(roleId)) {
                    newSelection = currentSelected.filter(r => r !== roleId);
                } else {
                    newSelection = [...currentSelected, roleId];
                }
            }
        }
        
        if(newSelection.length === 0) newSelection = ['all']; 
        onChange(newSelection);
    };

    return (
        <div className="flex gap-1 flex-wrap justify-end pointer-events-auto"> 
            <button 
                onClick={() => toggleRole('all')}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${isAll ? "bg-cyan-500/20 border-cyan-500 text-cyan-300" : "bg-black/40 border-white/10 text-white/50 hover:bg-white/5"}`}
            >
                Jeder
            </button>
            {ROLES.map(role => {
                const isActive = currentSelected.includes(role.id);
                return (
                    <button 
                        key={role.id}
                        onClick={() => toggleRole(role.id)}
                        className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                            isActive ? "bg-cyan-500/20 border-cyan-500 text-cyan-300" : 
                            "bg-black/40 border-white/10 text-white/50 hover:bg-white/5"
                        }`}
                    >
                        {role.label}
                    </button>
                );
            })}
        </div>
    );
};

export default function PondPage() {
  const { user, login } = useContext(TwitchAuthContext);
  const { streamerName } = useParams(); 

  const location = useLocation();
  const isCommandPage = location.pathname === "/pond/commands";
  
  // 1. NEU: "commands" als eigener Tab möglich
  const [activeTab, setActiveTab] = useState(isCommandPage ? "commands" : "my-fish");
  const [subTab, setSubTab] = useState("fish");
  // viewerSubTab entfernt, da Befehle jetzt in der Sidebar sind

  const [streamerAreaOpen, setStreamerAreaOpen] = useState(false);
  const [activeStreamers, setActiveStreamers] = useState([]); 
  const [selectedStreamer, setSelectedStreamer] = useState(null); 
  const [targetConfig, setTargetConfig] = useState(null); 
  const [searchTerm, setSearchTerm] = useState("");
  const [myFish, setMyFish] = useState("goldfish");
  const [savingFish, setSavingFish] = useState(false);

  // Config States
  const [requirements, setRequirements] = useState({});
  const [waterSettings, setWaterSettings] = useState({ 
        height: 10, opacity: 0.5, color: "#06b6d4", 
        sharkEnabled: true, showBubbles: true, showDecorations: true, 
        activeDecorations: ["seaweed_1", "rock_1", "ship"],
        layoutSeed: 12345, waveIntensity: 1, position: "bottom" 
    });
  const [excludedUsers, setExcludedUsers] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle"); 
  const [eventSettings, setEventSettings] = useState({ hypeTrain: true, raid: true });

  const isInitialLoad = useRef(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [viewerLinkCopied, setViewerLinkCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const debouncedWaterSettings = useDebounce(waterSettings, 500);
  const debouncedRequirements = useDebounce(requirements, 500);
  const debouncedExcluded = useDebounce(excludedUsers, 800);
  const debouncedEvents = useDebounce(eventSettings, 500);

  // --- SOCKET SETUP FOR STREAMER (OWN ROOM) ---
  useEffect(() => {
      if (user) {
          socket.connect();
          socket.emit('join_room', `streamer:${user.id}`); 
      }
      return () => { socket.disconnect(); };
  }, [user]);

  // --- NEU: SOCKET SETUP FOR VIEWER (OTHER ROOM) ---
  // Um Live-Updates (Badges) vom ausgewählten Streamer zu empfangen
  useEffect(() => {
      if (!selectedStreamer || !socket.connected) return;

      const room = `streamer:${selectedStreamer.id}`;
      socket.emit('join_room', room);

      const handleUpdate = (newConfig) => {
           console.log("Viewer Mode: Config update received", newConfig);
           // Wenn wir einen Streamer anschauen, aktualisieren wir targetConfig
           if (newConfig) {
               setTargetConfig(prev => ({
                   ...prev,
                   fishRequirements: newConfig.fishRequirements, // Wichtig für Badges
                   // Wir könnten hier auch anderes updaten, aber Requirements sind das Wichtigste
               }));
           }
      };

      socket.on('pond_config_update', handleUpdate);

      return () => {
          socket.off('pond_config_update', handleUpdate);
      };
  }, [selectedStreamer]);


  // INITIAL LOAD
  useEffect(() => {
    fetch("/api/pond/active-streamers")
        .then(res => res.json())
        .then(data => {
            setActiveStreamers(data);
            if (streamerName) {
                const found = data.find(s => s.displayName.toLowerCase() === streamerName.toLowerCase() || s.id === streamerName);
                if (found) { selectStreamer(found); } else { setSearchTerm(streamerName); }
            }
        }).catch(e => console.error(e));
  }, [streamerName]);

  useEffect(() => {
      if (!user) return;
      if (activeTab === "rules" || activeTab === "setup") {
        // Reset flags beim Tab-Wechsel
        isInitialLoad.current = true;
        setConfigLoaded(false);

        fetch("/api/pond/config/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                // Batch updates
                setRequirements(data.fishRequirements || {});
                setWaterSettings(prev => ({ ...prev, ...(data.waterSettings || {}) }));
                setExcludedUsers(data.excludedUsers || DEFAULT_BOTS);
                if(data.eventSettings) setEventSettings(data.eventSettings);
                
                setConfigLoaded(true);
                
                // WICHTIG: Timeout erhöht, um Debounce-Zyklen abzuwarten.
                // Erst NACHDEM die States gesetzt sind und der erste Debounce durch ist, erlauben wir das Speichern.
                setTimeout(() => { isInitialLoad.current = false; }, 1500);
            }).catch(e => console.error(e));
      }
  }, [user, activeTab]);

  // 4. FIX: Auto-Save Effect blockiert Initial-Saves strikt
  useEffect(() => {
      // Wenn Config noch nicht geladen ist ODER wir noch im Initial-Load Fenster sind -> Abbrechen
      if (!configLoaded || !user || isInitialLoad.current) return;

      const saveAndEmit = async () => {
          setAutoSaveStatus("saving");
          try {
              // Payload zusammenstellen
              const payload = { 
                  fishRequirements: debouncedRequirements, 
                  waterSettings: debouncedWaterSettings, 
                  excludedUsers: debouncedExcluded,
                  eventSettings: debouncedEvents,
                  streamerLogin: user.login 
              };

              await fetch("/api/pond/config", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
              });
              
              socket.emit('update_pond_config', {
                  streamerId: user.id,
                  config: payload
              });

              setAutoSaveStatus("saved");
              setTimeout(() => setAutoSaveStatus("idle"), 2000);
          } catch (e) { console.error("AutoSave Error", e); setAutoSaveStatus("error"); }
      };
      
      saveAndEmit();
  }, [debouncedWaterSettings, debouncedRequirements, debouncedExcluded, debouncedEvents, configLoaded, user]);

  useEffect(() => {
      if (isCommandPage) {
          setActiveTab("commands");
      }
  }, [location.pathname]);

  const selectStreamer = (streamer) => {
      setSelectedStreamer(streamer);
      setSearchTerm(streamer.displayName);
      setTargetConfig(null); 
      if (user) {
          fetch("/api/pond/me", { credentials: "include" }).then(res => res.json()).then(data => { const savedFish = data.overrides[streamer.id] || "goldfish"; setMyFish(savedFish); });
      }
      fetch(`/api/pond/config/public/${streamer.id}`).then(res => res.json()).then(data => { setTargetConfig(data); }).catch(err => console.error(err));
  };

  const handleSaveFish = async () => {
    if (!selectedStreamer) return;
    setSavingFish(true);
    try { 
        await fetch("/api/pond/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fishId: myFish, targetStreamerId: selectedStreamer.id }) }); 
    } catch(e) {}
    setTimeout(() => setSavingFish(false), 800);
  };
  
  const copyCode = () => { navigator.clipboard.writeText(SB_POND_IMPORT_CODE); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); };
  const copyToClipboard = (text, setter) => { navigator.clipboard.writeText(text); setter(true); setTimeout(() => setter(false), 2000); };

  const toggleDecoration = (decoId) => {
      const current = waterSettings.activeDecorations || [];
      if (current.includes(decoId)) { setWaterSettings({ ...waterSettings, activeDecorations: current.filter(d => d !== decoId) }); } 
      else { setWaterSettings({ ...waterSettings, activeDecorations: [...current, decoId] }); }
  };

  const randomizeLayout = () => {
      setWaterSettings({ ...waterSettings, layoutSeed: Date.now() });
  };

  const StreamerCard = ({ streamer, selected, onClick }) => {
    const initials = streamer.displayName.substring(0, 2).toUpperCase();
    return (
        <button 
            onClick={onClick}
            className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-300 w-full aspect-[4/3] justify-center gap-3 overflow-hidden
                ${selected 
                    ? "bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]" 
                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/30 hover:-translate-y-1 hover:shadow-xl"
                }`}
        >
            <div className={`absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/0 transition-all duration-500 ${selected ? "opacity-20 to-cyan-500/20" : "group-hover:opacity-10 group-hover:to-cyan-500/10"}`} />
            
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold transition-transform group-hover:scale-110 shadow-lg
                ${selected ? "bg-cyan-500 text-white" : "bg-black/40 text-white/50 group-hover:text-white"}`}>
                {initials}
            </div>

            <div className="relative z-10 text-center">
                <h3 className={`font-bold truncate max-w-[140px] ${selected ? "text-cyan-300" : "text-white"}`}>
                    {streamer.displayName}
                </h3>
                <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">ONLINE</span>
            </div>
            
            {selected && (
                <div className="absolute top-3 right-3 bg-cyan-500 text-black p-1 rounded-full shadow-lg animate-in fade-in zoom-in">
                    <Check size={12} strokeWidth={4} />
                </div>
            )}
        </button>
    );
  };

  const filteredStreamers = activeStreamers.filter(s => s.displayName.toLowerCase().includes(searchTerm.toLowerCase()));
  const overlayUrl = user ? `${window.location.origin}/overlay/pond/${user.id}` : "";
  const viewerUrl = user ? `${window.location.origin}/pond/fish/${user.login}` : "";

  if (!user) return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-white">
        <div className="bg-[#18181b] p-10 rounded-3xl border border-white/10 text-center shadow-2xl">
            <h1 className="text-4xl font-black mb-6 flex justify-center items-center gap-3"><Waves className="text-cyan-400" size={40}/> Viewer Pond</h1>
            <button onClick={() => login()} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg">Login mit Twitch</button>
        </div>
      </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 text-white min-h-screen">
      <div className="bg-[#18181b] rounded-3xl p-6 md:p-8 border border-white/10 shadow-xl mb-8 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-32 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
         <div className="relative z-10"><h1 className="text-3xl font-black tracking-tight mb-2 flex items-center gap-3"><Waves className="text-cyan-400" /> Viewer Sea </h1><span>(Lasse deine Viewer als Fische im Stream schwimmen | ähnlich wie Stream Avatars)</span></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* --- SIDEBAR --- */}
        <div className="xl:col-span-3 space-y-4">
            
            {/* 1. Viewer Bereich (Angepasst: Separate Tabs) */}
            <div>
                 <div className="px-2 mb-2 text-xs font-bold text-white/40 uppercase tracking-widest">Viewer</div>
                 <div className="space-y-2">
                    <button 
                        onClick={() => setActiveTab("my-fish")} 
                        className={`w-full text-left px-5 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${activeTab === "my-fish" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" : "bg-[#18181b] text-white/40 border border-white/5 hover:text-white hover:bg-white/5"}`}
                    >
                        <Fish size={20} /> Mein Fisch
                    </button>
                    {/* NEU: Eigener Button für Befehle */}
                    <button 
                        onClick={() => setActiveTab("commands")} 
                        className={`w-full text-left px-5 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${activeTab === "commands" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" : "bg-[#18181b] text-white/40 border border-white/5 hover:text-white hover:bg-white/5"}`}
                    >
                        <Terminal size={20} /> Befehle
                    </button>
                 </div>
            </div>

            {/* 2. Streamer Bereich (Collapsible) */}
            <div className="border-t border-white/5 pt-4">
                <button 
                    onClick={() => setStreamerAreaOpen(!streamerAreaOpen)}
                    className="flex items-center justify-between w-full px-2 mb-2 text-xs font-bold text-cyan-500/80 hover:text-cyan-400 uppercase tracking-widest transition-colors"
                >
                    <span className="flex items-center gap-2"><LayoutDashboard size={14}/> Für Streamer</span>
                    {streamerAreaOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                </button>
                
                {/* Animation Container für Klapp-Effekt */}
                <div className={`space-y-2 overflow-hidden transition-all duration-300 ${streamerAreaOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
                    <button 
                        onClick={() => setActiveTab("setup")} 
                        className={`w-full text-left px-5 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${activeTab === "setup" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" : "bg-[#18181b] text-white/40 border border-white/5 hover:text-white hover:bg-white/5"}`}
                    >
                        <Monitor size={20} /> Ersteinrichtung
                    </button>
                    <button 
                        onClick={() => setActiveTab("rules")} 
                        className={`w-full text-left px-5 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all ${activeTab === "rules" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" : "bg-[#18181b] text-white/40 border border-white/5 hover:text-white hover:bg-white/5"}`}
                    >
                        <Sliders size={20} /> Konfiguration
                    </button>
                </div>
            </div>
        </div>

        <div className="xl:col-span-9 bg-[#18181b] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative min-h-[500px]">
            {activeTab === "my-fish" && (
                    <div className="animate-in fade-in space-y-8">
                            <div className="flex flex-col md:flex-row gap-6 items-end justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Search className="text-cyan-400"/> Finde deinen Streamer</h2>
                                    <p className="text-white/50 text-sm">Wähle einen aktiven Kanal aus, um deinen Fisch anzupassen.</p>
                                </div>
                                <div className="w-full md:w-auto relative">
                                    <div className="bg-black/20 rounded-xl border border-white/5 flex gap-2 items-center px-4 py-3 w-full md:w-80 focus-within:border-cyan-500/50 focus-within:bg-black/40 transition-all">
                                        <Search className="text-white/30" size={18}/>
                                        <input type="text" placeholder="Suche..." className="bg-transparent border-none focus:ring-0 text-white flex-1 p-0 text-sm placeholder:text-white/20" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {filteredStreamers.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredStreamers.map(s => (
                                        <StreamerCard key={s.id} streamer={s} selected={selectedStreamer?.id === s.id} onClick={() => selectStreamer(s)}/>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 border border-white/5 bg-white/5 rounded-2xl">
                                    <UserX className="mx-auto text-white/20 mb-3" size={32}/>
                                    <p className="text-white/40">Keinen Streamer mit "{searchTerm}" gefunden.</p>
                                </div>
                            )}

                            <div className="w-full h-px bg-white/10 my-8" />

                            {selectedStreamer ? (
                                <div className="animate-in slide-in-from-bottom-4 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-cyan-500/20 p-2 rounded-lg"><Fish className="text-cyan-400" size={20}/></div>
                                        <div><h2 className="text-xl font-bold text-white">Dein Fisch für {selectedStreamer.displayName}</h2></div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                        {FISH_TYPES.map((fish) => { 
                                            const isSelected = myFish === fish.id; 
                                            const reqs = targetConfig?.fishRequirements?.[fish.id] || ["all"]; 
                                            return (
                                                <div key={fish.id} onClick={() => setMyFish(fish.id)} className={`relative rounded-2xl p-4 border-2 transition-all cursor-pointer group flex flex-col items-center gap-3 overflow-hidden ${isSelected ? "bg-cyan-500/10 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]" : "bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5"}`}>
                                                    <RoleBadges reqs={reqs} />
                                                    <div className="h-20 w-full flex items-center justify-center relative mt-2">
                                                        <img src={fish.img} alt={fish.name} className={`relative z-10 w-20 h-20 object-contain transition-transform duration-300 ${isSelected ? "scale-110 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]" : "opacity-70 group-hover:opacity-100 group-hover:scale-105"}`}/>
                                                    </div>
                                                    <h3 className={`font-bold text-sm ${isSelected ? "text-cyan-400" : "text-white"}`}>{fish.name}</h3>
                                                </div>
                                            ); 
                                        })}
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button onClick={handleSaveFish} disabled={savingFish} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg flex items-center gap-2">
                                            {savingFish ? <RefreshCw className="animate-spin" size={18}/> : <Save size={18}/>}
                                            {savingFish ? "Speichere..." : "Auswahl speichern"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 opacity-30 grayscale">
                                    <Fish size={48} className="mb-4"/>
                                    <p>Wähle oben einen Streamer.</p>
                                </div>
                            )}
                        </div>
             )}
             {/* 6. NEU: ANSICHT BEFEHLE (Separat) */}
            {activeTab === "commands" && (
                <div className="animate-in slide-in-from-right-4">
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2"><Terminal className="text-cyan-400"/> Verfügbare Befehle</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {COMMAND_LIST.map((c, i) => (
                            <div key={i} className="bg-black/20 border border-white/5 p-5 rounded-2xl flex items-center gap-5 hover:bg-black/30 transition-colors">
                                <div className="bg-cyan-500/20 p-3 rounded-xl text-cyan-400 shadow-inner">{c.icon}</div>
                                <div>
                                    <div className="font-mono text-cyan-300 font-bold text-sm bg-black/40 px-2 py-1 rounded w-fit mb-2 shadow-sm border border-white/5">{c.cmd}</div>
                                    <div className="text-white/70 text-sm leading-relaxed">{c.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

                    
            
            {/* NEUE SETUP SECTION */}
            {activeTab === "setup" && (
                <div className="animate-in fade-in space-y-8">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Monitor className="text-cyan-400"/> Ersteinrichtung</h2>
                        <p className="text-white/50 mb-6">Führe diese Schritte aus, um das Aquarium in deinen Stream zu integrieren.</p>
                    </div>

                    {/* 1. Streamer.bot Einrichtung */}
                    <div className="bg-black/20 p-6 rounded-2xl border border-white/5 space-y-6">
                        <div className="flex items-center gap-3 text-cyan-400 font-bold uppercase text-sm tracking-wider border-b border-white/5 pb-4">
                            <Terminal size={16}/> 1. Streamer.bot Einrichtung (Wird benötigt, sonst funktioniert nichts!)
                        </div>

                        {/* Step A: Server starten */}
                         <div className="flex gap-4">
                            <div className="shrink-0 w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">A</div>
                            <div>
                                <h3 className="text-white font-bold flex items-center gap-2"><Server size={16}/> WebSocket Server starten</h3>
                                <p className="text-white/60 text-sm mt-1">Öffne Streamer.bot, gehe oben auf den Reiter <span className="text-white font-mono bg-white/10 px-1 rounded">Servers/Clients</span> → <span className="text-white font-mono bg-white/10 px-1 rounded">WebSocket Server</span> und klicke auf "Start Server". (Auto-Start empfohlen).</p>
                            </div>
                        </div>

                        {/* Step B: Code Import */}
                        <div className="flex gap-4">
                            <div className="shrink-0 w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold border border-cyan-500/30">B</div>
                            <div className="w-full">
                                <h3 className="text-white font-bold flex items-center gap-2"><Download size={16}/> Actions Importieren</h3>
                                <p className="text-white/60 text-sm mt-1 mb-3">Kopiere den Code und importiere ihn in Streamer.bot (Import-Button oben).</p>
                                
                                {/* Import Code Box */}
                                <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden w-full">
                                    <div className="flex items-center justify-between p-2 bg-white/5 border-b border-white/5">
                                        <span className="text-[10px] font-bold text-white/50 uppercase pl-2">Import String</span>
                                        <button 
                                            onClick={copyCode}
                                            className="flex items-center gap-2 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-bold transition-colors text-white"
                                        >
                                            {codeCopied ? <Check size={12} /> : <Copy size={12} />}
                                            {codeCopied ? "Kopiert!" : "Code Kopieren"}
                                        </button>
                                    </div>
                                    <pre className="p-3 text-[10px] text-white/50 font-mono overflow-y-auto max-h-[100px] custom-scrollbar break-all whitespace-pre-wrap select-all">
                                        {SB_POND_IMPORT_CODE}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        {/* Step C: Commands Liste */}
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <h4 className="text-sm font-bold text-white mb-3">Verfügbare Befehle (Vergiss nicht, diese im Reiter "Commands" zu aktivieren!)</h4>
                            <div className="space-y-2 text-xs">
                                <div className="flex gap-3 items-center">
                                    <span className="font-mono text-cyan-300 bg-cyan-900/30 px-2 py-1 rounded">!shark [user]</span>
                                    <span className="text-white/60">Lässt den Hai auf einen bestimmten User los.</span>
                                </div>
                                <div className="flex gap-3 items-center">
                                    <span className="font-mono text-cyan-300 bg-cyan-900/30 px-2 py-1 rounded">!say [nachricht]</span>
                                    <span className="text-white/60">Dein Fisch zeigt eine Sprechblase mit der Nachricht an.</span>
                                </div>
                                <div className="flex gap-3 items-center">
                                    <span className="font-mono text-cyan-300 bg-cyan-900/30 px-2 py-1 rounded">!fish</span>
                                    <span className="text-white/60">Postet den Link zur Auswahlseite im Chat.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. OBS & Link Setup */}
                    <div className="bg-black/20 p-6 rounded-2xl border border-white/5 space-y-4">
                         <div className="flex items-center gap-3 text-cyan-400 font-bold uppercase text-sm tracking-wider">
                            <Monitor size={16}/> 2. OBS & Viewer Link
                        </div>
                        
                        <div className="space-y-1">
                            <label className="text-xs text-white/40 font-bold uppercase">Browser Source URL (1920x1080)</label>
                            <div className="flex gap-2">
                                <input type="text" readOnly value={overlayUrl} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white/70 font-mono text-sm focus:outline-none" />
                                <button 
                                    onClick={() => copyToClipboard(overlayUrl, setOverlayCopied)}
                                    className={`px-4 rounded-xl font-bold transition-all flex items-center gap-2 ${overlayCopied ? "bg-green-500/20 text-green-400" : "bg-white/5 hover:bg-white/10"}`}
                                >
                                    {overlayCopied ? <Check size={18}/> : <Copy size={18}/>}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2">
                             <label className="text-xs text-white/40 font-bold uppercase">Öffentlicher Link für deine Viewer (Auch über !fish abrufbar)</label>
                            <div className="flex gap-2">
                                <input type="text" readOnly value={viewerUrl} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white/70 font-mono text-sm focus:outline-none" />
                                <button 
                                    onClick={() => copyToClipboard(viewerUrl, setViewerLinkCopied)}
                                    className={`px-4 rounded-xl font-bold transition-all flex items-center gap-2 ${viewerLinkCopied ? "bg-green-500/20 text-green-400" : "bg-white/5 hover:bg-white/10"}`}
                                >
                                    {viewerLinkCopied ? <Check size={18}/> : <Copy size={18}/>}
                                </button>
                                
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "rules" && (
                <div className="animate-in fade-in flex flex-col h-full">
                    {/* Header mit Auto-Save Status */}
                    <div className="mb-6 flex justify-between items-start">
                        <div><h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Sliders className="text-cyan-400"/> Konfiguration</h2></div>
                        <div className="flex items-center gap-2">
                             {autoSaveStatus === "saving" && <span className="text-xs text-white/40 flex items-center gap-1 animate-pulse"><RefreshCw size={12} className="animate-spin"/> Speichere...</span>}
                             {autoSaveStatus === "saved" && <span className="text-xs text-green-400 flex items-center gap-1 animate-in fade-in"><Check size={12}/> Gespeichert</span>}
                             {autoSaveStatus === "idle" && <span className="text-xs text-white/20 flex items-center gap-1"><Zap size={12}/> Auto-Sync Aktiv</span>}
                        </div>
                    </div>
                    
                    <div className="flex space-x-2 border-b border-white/10 mb-6">
                        {[{ id: "fish", label: "Fisch Regeln", icon: Award }, { id: "water", label: "Wasser & Design", icon: Droplets },{ id: "events", label: "Events", icon: Sparkles }, { id: "exclude", label: "Ignorierte User", icon: UserX }].map(sub => (<button key={sub.id} onClick={() => setSubTab(sub.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-colors ${subTab === sub.id ? "border-cyan-500 text-white" : "border-transparent text-white/40 hover:text-white"}`}><sub.icon size={16}/> {sub.label}</button>))}
                    </div>

                    {subTab === "fish" && configLoaded && (
                        <div className="space-y-3 animate-in fade-in">
                             {FISH_TYPES.map(fish => (
                                <div key={fish.id} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-4 hover:bg-black/30 transition-colors">
                                    <div className="flex items-center gap-4"><div className="w-14 h-14 bg-white/5 rounded-xl p-2 flex items-center justify-center border border-white/10"><img src={fish.img} alt={fish.name} className="w-full h-full object-contain" /></div><div className="font-bold text-white text-lg">{fish.name}</div></div>
                                    <div className="flex flex-col items-end gap-2"><label className="text-[10px] font-bold text-white/40 uppercase flex items-center gap-1"><Lock size={10}/> Erlaubte Rollen</label><RoleMultiSelect selected={requirements[fish.id] || ["all"]} onChange={(newRoles) => setRequirements({...requirements, [fish.id]: newRoles})}/></div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {subTab === "water" && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <PositionToggle value={waterSettings.position || "bottom"} onChange={(v) => setWaterSettings({...waterSettings, position: v})} />
                                <RangeControl label="Höhe im Overlay" value={waterSettings.height} min={2} max={100} step={1} unit="%" onChange={(v) => setWaterSettings({...waterSettings, height: v})} />
                                <RangeControl label="Transparenz" value={waterSettings.opacity} min={0} max={1} step={0.1} onChange={(v) => setWaterSettings({...waterSettings, opacity: v})} />
                                <RangeControl label="Wellen Intensität" value={waterSettings.waveIntensity || 0} min={0} max={2} step={1} onChange={(v) => setWaterSettings({...waterSettings, waveIntensity: v})} />
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                    <label className="text-xs text-white/60 font-medium mb-3 block">Wasserfarbe</label>
                                    <div className="flex gap-3 overflow-x-auto pb-2">
                                        {["#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"].map(c => (<button key={c} onClick={() => setWaterSettings({...waterSettings, color: c})} className={`w-10 h-10 rounded-full border-2 transition-all ${waterSettings.color === c ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"}`} style={{ backgroundColor: c }} />))}
                                        <input type="color" value={waterSettings.color} onChange={(e) => setWaterSettings({...waterSettings, color: e.target.value})} className="w-10 h-10 rounded-full cursor-pointer bg-transparent border-0 p-0" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <Toggle label="Hai Attacke aktiv" checked={waterSettings.sharkEnabled} onChange={(v) => setWaterSettings({...waterSettings, sharkEnabled: v})} />
                                    <Toggle label="Blubberblasen" checked={waterSettings.showBubbles} onChange={(v) => setWaterSettings({...waterSettings, showBubbles: v})} />
                                    <Toggle label="Hintergrund Deko" checked={waterSettings.showDecorations} onChange={(v) => setWaterSettings({...waterSettings, showDecorations: v})} />
                                </div>
                            </div>

                            <div className="bg-black/20 p-4 rounded-xl border border-white/5 relative">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-xs text-white/60 font-medium flex items-center gap-2"><ImageIcon size={14}/> Aktive Dekorationen</label>
                                    <button onClick={randomizeLayout} className="text-xs bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors border border-cyan-500/30"><Shuffle size={12} /> Layout Randomizen</button>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                    {DECO_OPTIONS.map(deco => {
                                        const isActive = (waterSettings.activeDecorations || []).includes(deco.id);
                                        return (
                                            <button key={deco.id} onClick={() => toggleDecoration(deco.id)} className={`relative aspect-square rounded-xl border-2 transition-all overflow-hidden flex items-center justify-center p-2 bg-white/5 ${isActive ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_10px_rgba(6,182,212,0.3)]" : "border-transparent opacity-60 hover:opacity-100 hover:border-white/20"}`}>
                                                <img src={deco.img} alt={deco.name} className={`w-full h-full object-contain ${isActive ? "" : "grayscale"}`}/>
                                                {isActive && <div className="absolute top-1 right-1 bg-cyan-500 text-black p-0.5 rounded-full"><Check size={8} strokeWidth={4}/></div>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                    {subTab === "events" && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-black/20 p-6 rounded-2xl border border-white/5 space-y-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Event Einstellungen</h3>
                                    <p className="text-white/50 text-sm">Steuere, welche Twitch-Events das Aquarium beeinflussen.</p>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                                        <div>
                                            <div className="font-bold text-white flex items-center gap-2"><Zap size={16} className="text-yellow-400"/> HypeTrain Rainbow</div>
                                            <p className="text-xs text-white/50 mt-1">Das Wasser färbt sich regenbogenfarben und Fische feiern, wenn ein HypeTrain aktiv ist.</p>
                                        </div>
                                        {/* Hier wird der debouncedEvents State indirekt verändert via setEventSettings */}
                                        <Toggle label="" checked={eventSettings.hypeTrain} onChange={(v) => setEventSettings({...eventSettings, hypeTrain: v})} />
                                    </div>
                                    
                                    <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                                        <div>
                                            <div className="font-bold text-white flex items-center gap-2"><UserX size={16} className="text-purple-400"/> Raid Swarm</div>
                                            <p className="text-xs text-white/50 mt-1">Ein massiver Fischschwarm schwimmt durch das Bild, wenn ein Raid eingeht.</p>
                                        </div>
                                        <Toggle label="" checked={eventSettings.raid} onChange={(v) => setEventSettings({...eventSettings, raid: v})} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {subTab === "exclude" && (<div className="space-y-4 animate-in fade-in"><textarea className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-cyan-500 focus:outline-none font-mono" value={excludedUsers} onChange={(e) => setExcludedUsers(e.target.value)} /></div>)}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}