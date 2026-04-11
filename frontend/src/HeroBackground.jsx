import React from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Float, Lightformer } from "@react-three/drei";
import { Planet } from "./Planet";

const HeroBackground = () => {
  return (
    <figure style={{
      position: "fixed",
      inset: 0,
      zIndex: -50,
      width: "100vw",
      height: "100vh",
      background: "radial-gradient(circle at center, #111827 0%, #030712 100%)",
      margin: 0,
      padding: 0
    }}>
      <Canvas shadows camera={{ position: [0, 0, -10], fov: 17.5, near: 1, far: 20 }}>
        <ambientLight intensity={0.5} />

        {/* Makes the planet float up and down slightly */}
        <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
          <Planet scale={1} />
        </Float>

        {/* High-end Studio Lighting */}
        <Environment resolution={256}>
          <group rotation={[-Math.PI / 3, 4, 1]}>
            <Lightformer form="circle" intensity={2} position={[0, 5, -9]} scale={10} />
            <Lightformer form="circle" intensity={2} position={[0, 3, 1]} scale={10} />
            <Lightformer form="circle" intensity={2} position={[-5, -1, -1]} scale={10} />
            <Lightformer form="circle" intensity={2} position={[10, 1, 0]} scale={16} />
          </group>
        </Environment>
      </Canvas>
    </figure>
  );
};

export default HeroBackground;
