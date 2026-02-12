import "./sprited-tool.css";
import { SpritedTool } from "./SpritedTool";

const app = document.getElementById("app")!;
const tool = new SpritedTool(app);
tool.init();
