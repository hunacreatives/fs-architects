export interface TeamMember {
  name: string;
  title: string;
  department: string;
  avatar: string;
  email?: string;
  slackName?: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: 'Francis Fiel Roble',
    title: 'Founder/Creative Director',
    department: 'Management',
    avatar: '/images/team-francis-fiel-roble.webp',
    email: 'francisfielroble@gmail.com',
  },
  {
    name: 'Thamara Ong',
    title: 'Partner & Senior Brand Strategist',
    department: 'Management',
    avatar: '/images/team-thamara-ong.webp',
  },
  {
    name: 'Ma. Reeva Jumawan',
    title: 'Partner & Senior Visual Director',
    department: 'Creative',
    avatar: '/images/team-reeva-jumawan.webp',
    email: 'reevajumawan@gmail.com',
  },
  {
    name: 'Katleen Nellas',
    title: 'Senior Graphic Designer',
    department: 'Creative',
    avatar: '/images/team-katleen-nellas.webp',
    email: 'nellaskatleen@gmail.com',
  },
  {
    name: 'Abigail Duterte',
    title: 'HR Specialist / Admin',
    department: 'Admin',
    avatar: '/images/team-abigail-duterte.webp',
    email: 'duterteabigaile@gmail.com',
  },
  {
    name: 'Angela Louise Ando',
    title: 'Admin / Account Specialist',
    department: 'Account Management',
    avatar: '/images/team-angela-ando.webp',
    email: 'angelalouiseando@gmail.com',
  },
  {
    name: 'Claudette Tahil',
    title: 'Admin / Account Specialist',
    department: 'Account Management',
    avatar: '/images/6785570f89c09728ca73acf4660742b6.png',
    email: 'claudettemaytahil@gmail.com',
    slackName: 'Claudy Tahil',
  },
  {
    name: 'Reese Jumawan',
    title: 'Junior Graphic Designer',
    department: 'Creative',
    avatar: '/images/team-reese-jumawan.webp',
    email: 'janreesepj@gmail.com',
    slackName: 'Bing',
  },
  {
    name: 'Dan',
    title: 'Web Designer',
    department: 'Tech',
    avatar: '',
  },
];
