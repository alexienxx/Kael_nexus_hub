const TypingIndicator = () => {
  return (
    <div className="flex justify-start">
      <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="typing-dot h-2 w-2 rounded-full bg-neon-purple" />
          <div className="typing-dot h-2 w-2 rounded-full bg-neon-purple" />
          <div className="typing-dot h-2 w-2 rounded-full bg-neon-purple" />
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
