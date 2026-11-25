import { Clapperboard, Film, Mic, Radio, Star, Users } from 'lucide-react';

export const modules = [
  {
    label: 'Cinema',
    path: '/cinema',
    Icon: Film,
    description:
      'Independent short films from filmmakers with a point of view.',
  },
  {
    label: 'Originals',
    path: '/originals',
    Icon: Clapperboard,
    description: 'Short films developed and produced in-house by FDFS.',
  },
  {
    label: '404 Podcasts',
    path: '/podcasts',
    Icon: Mic,
    description: 'Listen to conversations on 404 Reality Not Found.',
  },
  {
    label: 'Live',
    path: '/live',
    Icon: Radio,
    description: 'Live sports, meetups and community events.',
  },
  {
    label: 'Reviews',
    path: '/reviews',
    detailPath: '/movies/:slug',
    Icon: Star,
    description:
      'Ratings and perspectives on mainstream movies and short films.',
  },
  {
    label: 'Talent',
    path: '/talent',
    Icon: Users,
    description:
      'Meet the filmmakers, cast, crew and voices behind the stories.',
  },
];
