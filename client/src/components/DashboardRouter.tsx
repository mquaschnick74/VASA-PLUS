// client/src/components/DashboardRouter.tsx
export function DashboardRouter({ userId, setUserId }) {
  const [userType, setUserType] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user profile to get type
    fetchUserProfile(userId).then(profile => {
      setUserType(profile.user_type);
    });
  }, [userId]);

  switch(userType) {
    case 'therapist':
      return <TherapistDashboard userId={userId} setUserId={setUserId} />;
    case 'client':
      return <ClientDashboard userId={userId} setUserId={setUserId} />;
    default:
      return <VoiceInterface userId={userId} setUserId={setUserId} />; // Current dashboard
  }
}