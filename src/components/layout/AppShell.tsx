import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";

const AppShell = () => {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
};

export default AppShell;
