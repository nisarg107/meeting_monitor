import { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";

export default function useTranscription(serverUrl: string) {
  const [transcript, setTranscript] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    // 1. Connect to server
    socketRef.current = io(serverUrl);

    socketRef.current.on("connect", () => {
      console.log("Connected to server:", socketRef.current?.id);
    });

    // 2. Receive transcript updates
    socketRef.current.on("transcript", (text: string) => {
      setTranscript(prev => prev + " " + text);
    });

    // 3. Setup microphone capture
    (async () => {
      try {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(mediaStreamRef.current, {
          mimeType: "audio/webm;codecs=opus",
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.addEventListener("dataavailable", async (event) => {
          if (event.data.size > 0 && socketRef.current) {
            const buffer = await event.data.arrayBuffer();
            const base64 = arrayBufferToBase64(buffer);
            socketRef.current.emit("audio-data", base64);
          }
        });

        mediaRecorder.start(250); // send every 250ms
      } catch (err) {
        console.error("Microphone error:", err);
      }
    })();

    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      socketRef.current?.disconnect();
    };
  }, [serverUrl]);

  return { transcript };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}
