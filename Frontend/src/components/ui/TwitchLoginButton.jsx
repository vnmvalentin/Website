// TwitchLoginButton.jsx — „Mit Twitch anmelden" überall gleich (Farbe, Symbol, Text).
// Vorher steckte derselbe Knopf in rund neun Varianten in den Seiten.
import React, { useContext } from "react";
import { TwitchAuthContext } from "../TwitchAuthContext";
import { TwitchGlyph } from "../BrandGlyphs";
import Button from "./Button";

/**
 * @param {object} props
 * @param {boolean} [props.force]  an login() durchgereicht (true = Twitch fragt das Konto neu ab)
 * @param {"sm"|"md"|"lg"} [props.size]
 * @param {React.ReactNode} [props.children]  anderer Text, Standard „Mit Twitch anmelden"
 */
export default function TwitchLoginButton({ force = false, size = "md", children, onClick, ...rest }) {
  const { login } = useContext(TwitchAuthContext);
  return (
    <Button
      variant="twitch"
      size={size}
      icon={TwitchGlyph}
      onClick={(e) => { onClick?.(e); login(force); }}
      {...rest}
    >
      {children ?? "Mit Twitch anmelden"}
    </Button>
  );
}
