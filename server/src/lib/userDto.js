function toPublicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    jobTitle: u.jobTitle,
    hourlyRate: Number(u.hourlyRate),
    weeklyHours: u.weeklyHours,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt,
  };
}

module.exports = { toPublicUser };
