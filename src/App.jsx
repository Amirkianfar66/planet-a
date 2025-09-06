import { useState } from "react";

export default function App() {
    const [count, setCount] = useState(0);

    return (
        <div style={{ textAlign: "center", marginTop: "50px" }}>
            <h1>Click Counter</h1>
            <p>Count: {count}</p>
            <button
                onClick={() => setCount(count + 1)}
                style={{ padding: "10px 20px", fontSize: "16px" }}
            >
                Click me!
            </button>
        </div>
    );
}
