type ConnectivityStatusProps = {
  isOnline: boolean;
};

export default function ConnectivityStatus({
  isOnline,
}: ConnectivityStatusProps) {
  if (isOnline) {
    return null;
  }

  return (
    <aside className="connectivity-status" role="status">
      <strong>You're offline.</strong>
      <span>
        Local quizzes and statistics still work. AI generation needs an
        internet connection.
      </span>
    </aside>
  );
}
