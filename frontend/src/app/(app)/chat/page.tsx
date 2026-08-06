"use client";

import { Sidebar } from "@/components/chat/Sidebar";
import { MessageCircle } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="w-full md:w-80 lg:w-96 shrink-0 h-full">
        <Sidebar />
      </div>
      <div className="hidden md:flex flex-1 items-center justify-center bg-[#f0f2f5]">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-full bg-[#075e54]/10 flex items-center justify-center">
              <MessageCircle className="w-10 h-10 text-[#075e54]/50" />
            </div>
          </div>
          <h2 className="text-xl font-light text-gray-600">WhatsApp Web</h2>
          <p className="text-sm text-gray-400 mt-2 max-w-xs">
            Select a chat from the left panel to start messaging.
          </p>
        </div>
      </div>
    </div>
  );
}
