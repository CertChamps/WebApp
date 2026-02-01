import { useState } from 'react';

export default function AIChat() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');

  const askAI = async () => {
    const res = await fetch('https://chat-kubjun6ifq-uc.a.run.app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input }),
    });
    
    const data = await res.json();
    setResponse(data.output);
  };

  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={askAI}>Ask GPT-4.1 Mini</button>
      <p>AI said: {response}</p>
    </div>
  );
}