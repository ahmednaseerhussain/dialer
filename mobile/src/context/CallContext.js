import React, { createContext, useContext, useState, useRef } from 'react';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null);
  const [callState, setCallState] = useState('idle'); // idle, connecting, connected, disconnected
  const [callInfo, setCallInfo] = useState(null); // { number, name, direction }
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const timerRef = useRef(null);

  function startTimer() {
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetCall() {
    stopTimer();
    setActiveCall(null);
    setCallState('idle');
    setCallInfo(null);
    setIsMuted(false);
    setIsOnHold(false);
    setIsSpeaker(false);
    setCallDuration(0);
  }

  return (
    <CallContext.Provider
      value={{
        activeCall, setActiveCall,
        callState, setCallState,
        callInfo, setCallInfo,
        isMuted, setIsMuted,
        isOnHold, setIsOnHold,
        isSpeaker, setIsSpeaker,
        callDuration, setCallDuration,
        incomingInvite, setIncomingInvite,
        startTimer, stopTimer, resetCall,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within CallProvider');
  return context;
}
