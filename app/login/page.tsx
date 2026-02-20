import { MessageSquare } from "lucide-react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#111b21] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00a884] mb-4">
            <MessageSquare size={32} className="text-white" />
          </div>
          <h1 className="text-[#e9edef] text-2xl font-semibold">
            WPP Dashboard
          </h1>
          <p className="text-[#8696a0] mt-1 text-sm">
            Sign in to manage your conversations
          </p>
        </div>
        <div className="bg-[#202c33] rounded-2xl p-6 shadow-xl">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
