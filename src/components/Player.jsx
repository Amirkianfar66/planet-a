import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export default function Player({ color = "hotpink" }) {
    const ref = useRef();

    useFrame((state, delta) => {
        ref.current.rotation.y += delta; // simple spin
    });

    return (
        <mesh ref={ref}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={color} />
        </mesh>
    );
}
