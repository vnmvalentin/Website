import React, { useContext } from "react";
import { TwitchAuthContext } from "./TwitchAuthContext";

export default function TwitchLoginButton() {
  const { user, login, logout } = useContext(TwitchAuthContext);

  return (
    <div className="flex items-center gap-3">
      {user ? (
        <>
          <img
            src={user.profile_image_url}
            alt="avatar"
            className="w-8 h-8 rounded-full border-2 border-purple-500"
          />
          <span className="text-sm">{user.display_name}</span>
          <button
            onClick={logout}
            className="bg-red-600 text-white px-2 py-1 rounded text-sm"
          >
            Logout
          </button>
        </>
      ) : (
        <button
          onClick={login}
          className="bg-[#9146FF] hover:bg-[#772ce8] text-white px-3 py-1 rounded text-sm"
        >
          Login mit Twitch
        </button>
      )}
    </div>
  );
}
