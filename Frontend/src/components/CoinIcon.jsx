import React from "react";

export default function CoinIcon({ size = "w-5 h-5", className = "" }) {
  // 'inline-block' und 'align-middle' sorgen dafür, dass es im Text gut fließt
  return (
    <img 
      src="/coin.png" 
      alt="Coins" 
      className={`inline-block object-contain ${size} ${className}`} 
      style={{ verticalAlign: 'middle', marginBottom: '2px' }} // Feinjustierung
    />
  );
}