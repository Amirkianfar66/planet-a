import React from "react";
import Astronaut3DBase from "./Astronaut3DBase";
export default function Engineer({ name, showName = true, ...rest }) {
    return <Astronaut3DBase suit="#FF8D3A" prop="wrench" name={name} role="Engineer" showName={showName} {...rest} />;
}
