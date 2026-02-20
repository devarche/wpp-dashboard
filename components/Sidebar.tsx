"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, LayoutTemplate, Megaphone, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", icon: MessageSquare, label: "Chats" },
  { href: "/dashboard/templates", icon: LayoutTemplate, label: "Templates" },
  { href: "/dashboard/campaigns", icon: Megaphone, label: "Campaigns" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-16 bg-[#202c33] border-r border-[#2a3942] flex flex-col items-center py-4 gap-1 flex-shrink-0">
      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1 w-full px-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                isActive
                  ? "bg-[#00a884] text-white"
                  : "text-[#8696a0] hover:bg-[#2a3942] hover:text-[#e9edef]"
              }`}
            >
              <Icon size={20} />
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="mt-auto flex flex-col items-center gap-1 w-full px-2">
        <Link
          href="/dashboard/settings"
          title="Settings"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[#8696a0] hover:bg-[#2a3942] hover:text-[#e9edef] transition-colors"
        >
          <Settings size={20} />
        </Link>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[#8696a0] hover:bg-red-900/30 hover:text-red-400 transition-colors"
        >
          <LogOut size={20} />
        </button>
      </div>
    </aside>
  );
}
