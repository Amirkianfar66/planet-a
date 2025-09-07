- function Players() {
+ function Players({ dead = [] }) {
   const players = usePlayersList(true);
   return (
     <>
       {players.map((p) => {
+        if (dead.includes(p.id)) return null;
         const x = Number(p.getState('x') ?? 0);
         const y = Number(p.getState('y') ?? 0);
         const z = Number(p.getState('z') ?? 0);
         const color = myPlayer().id === p.id ? 'hotpink' : 'deepskyblue';
         return (
           <mesh key={p.id} position={[x, y, z]}>
             <sphereGeometry args={[0.5, 16, 16]} />
             <meshStandardMaterial color={color} />
           </mesh>
         );
       })}
     </>
   );
}
