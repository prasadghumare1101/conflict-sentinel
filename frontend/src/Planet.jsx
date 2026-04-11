import React from 'react';

export const Planet = ({ scale = 1 }) => {
  return (
    <mesh scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial color="#f87171" roughness={0.5} metalness={0.2} />
    </mesh>
  );
};
