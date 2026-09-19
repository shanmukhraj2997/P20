from django.core.management.base import BaseCommand
from resources.models import ResourceType, Resource
from accounts.models import User

class Command(BaseCommand):
    help = 'Seeds realistic university campus resources and resource types.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Starting campus resource seed process...'))

        # Ensure demo custodian exists
        custodian_user, _ = User.objects.get_or_create(
            username='demo_custodian',
            defaults={
                'email': 'custodian@campus.edu',
                'role': User.ROLE_CUSTODIAN,
                'department': 'Campus Infrastructure & Facilities',
                'first_name': 'Sarah',
                'last_name': 'Jenkins',
            }
        )
        if not custodian_user.has_usable_password():
            custodian_user.set_password('DemoPass123!')
            custodian_user.save()

        # Seed Resource Types
        types_data = [
            {'name': 'Computer Laboratory', 'icon': 'monitor', 'description': 'Equipped computer labs for programming, AI training, and data science.'},
            {'name': 'Classroom', 'icon': 'book-open', 'description': 'Lecture halls and interactive classrooms for academic instruction.'},
            {'name': 'Seminar Hall', 'icon': 'users', 'description': 'Large capacity auditoriums and symposium halls.'},
            {'name': 'Meeting Room', 'icon': 'briefcase', 'description': 'Conference rooms for faculty meetings, project reviews, and discussions.'},
            {'name': 'Specialized Equipment', 'icon': 'cpu', 'description': 'High-end analytical, optical, and fabrication equipment.'},
            {'name': 'Sports Facility', 'icon': 'trophy', 'description': 'Indoor courts, gymnasiums, and athletic grounds.'},
        ]

        type_objs = {}
        for t_data in types_data:
            obj, created = ResourceType.objects.get_or_create(
                name=t_data['name'],
                defaults={'icon': t_data['icon'], 'description': t_data['description']}
            )
            type_objs[t_data['name']] = obj

        # Seed Resources
        resources_data = [
            {
                'name': 'Advanced AI & Supercomputing Lab',
                'type': 'Computer Laboratory',
                'capacity': 60,
                'location': 'Turing Science Block, Floor 3, Room 301',
                'description': 'State-of-the-art AI laboratory featuring workstation PCs equipped with NVIDIA A100 GPUs, high-speed fiber interconnects, and dual 4K teaching displays.',
                'features': ['NVIDIA A100 GPUs', 'Gigabit Ethernet', 'Smart Board', 'Central AC', '60 High-End Workstations'],
                'image_url': 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
            {
                'name': 'Alan Turing Central Auditorium & Seminar Hall',
                'type': 'Seminar Hall',
                'capacity': 350,
                'location': 'Main Academic Complex, Level 2',
                'description': 'Central auditorium suitable for university conferences, guest lectures, and cultural events. Features motorized stage lighting, acoustic treatment, and dual laser projectors.',
                'features': ['Surround Sound System', 'Dual 4K Laser Projectors', 'Stage Lighting', 'Podium & Wireless Mics', 'Live Stream Control Rig'],
                'image_url': 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
            {
                'name': 'Quantum Physics & Cryogenics Research Lab',
                'type': 'Specialized Equipment',
                'capacity': 15,
                'location': 'Raman Physics Wing, Room 104',
                'description': 'Specialized physics facility equipped with liquid helium cryogenic cooling rigs, optical vibration isolation tables, and spectrum analyzers.',
                'features': ['Cryogenic Cooling Rig', 'Laser Optics Table', 'Class 100 Cleanroom', 'RF Shielding', 'Emergency Power Backup'],
                'image_url': 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
            {
                'name': 'Executive Senate Conference Room',
                'type': 'Meeting Room',
                'capacity': 24,
                'location': 'Vice-Chancellor Block, Room 201',
                'description': 'Executive conference room with interactive 86-inch touchscreen display, integrated ceiling beamforming microphones, and video conferencing bridge.',
                'features': ['Video Conferencing System', 'Interactive 4K Screen', 'Executive Seating', 'Catering Support Counter'],
                'image_url': 'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
            {
                'name': 'Olympic Indoor Basketball Arena',
                'type': 'Sports Facility',
                'capacity': 150,
                'location': 'Campus Sports Complex, Pavilion A',
                'description': 'FIBA-standard maple wood indoor basketball court with electronic LED scoreboard, spectator bleachers, and connected changing rooms.',
                'features': ['Maple Hardwood Court', 'Electronic Scoreboard', 'Locker & Shower Rooms', 'PA System', 'Lighting Presets'],
                'image_url': 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
            {
                'name': 'Interactive Smart Classroom 102',
                'type': 'Classroom',
                'capacity': 45,
                'location': 'Engineering Block B, Room 102',
                'description': 'Modern classroom featuring movable collaborative desks, ultra-short-throw interactive projectors, and high-definition hybrid lecture capture cameras.',
                'features': ['Hybrid Lecture Capture', 'Movable Desks', 'Touchscreen Board', 'High-Speed Wi-Fi 6'],
                'image_url': 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
            {
                'name': 'Digital Confocal Microscope Unit',
                'type': 'Specialized Equipment',
                'capacity': 6,
                'location': 'BioTech Research Pavilion, Room 008',
                'description': 'High-resolution laser scanning confocal microscope workstation for 3D cellular imaging and fluorescence spectral analysis.',
                'features': ['Laser Scanning Head', 'Fluorescence Channels', 'High-Spec Analysis PC', 'Vibration Table'],
                'image_url': 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
                'status': 'maintenance',
            },
            {
                'name': 'Robotics & Rapid Prototyping Workshop',
                'type': 'Computer Laboratory',
                'capacity': 35,
                'location': 'Innovation Hub, Ground Floor',
                'description': 'Hands-on fabrication space equipped with industrial 3D printers, CNC PCB routers, digital oscilloscopes, and soldering stations.',
                'features': ['Industrial 3D Printers', 'CNC PCB Router', 'Digital Oscilloscopes', 'Fume Extractors'],
                'image_url': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
                'status': 'available',
            },
        ]

        created_count = 0
        for r_data in resources_data:
            res_type = type_objs[r_data['type']]
            _, created = Resource.objects.get_or_create(
                name=r_data['name'],
                defaults={
                    'resource_type': res_type,
                    'capacity': r_data['capacity'],
                    'location': r_data['location'],
                    'description': r_data['description'],
                    'features': r_data['features'],
                    'image_url': r_data['image_url'],
                    'status': r_data['status'],
                    'custodian': custodian_user,
                }
            )
            if created:
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully seeded {len(type_objs)} resource types and {created_count} campus resources.'))
