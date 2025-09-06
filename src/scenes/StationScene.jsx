import Player from "../components/Player";

export default function StationScene() {
    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            <Player />
        </>
    );
}
