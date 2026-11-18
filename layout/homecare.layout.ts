import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
  DestroyRef,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// Angular Material
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

// Modais (Dialogs)
import { PatientCreateComponent } from '../components/patients/patient-create/patient-create.component';
import { UserCreateComponent } from '../components/users/user-create/user-create.component';
import { RoleCreateComponent } from '../components/roles/role-create/role-create.component';

// Enums Locais e Serviços (Padrão alias "as User")
import { Professionals } from '../enums/professionals';
import { HomecareUser as User } from '../models/user.model';
import { AuthService } from '../services/auth.service';

// ============================================================================
// CONFIGURAÇÃO DO MÓDULO (Único bloco a ajustar ao replicar para outro módulo)
// ============================================================================
type ChannelKey = 'ROLES' | 'USERS' | 'PATIENTS';

const LAYOUT_CONFIG = {
  moduleSlug: 'homecare',
  channels: {
    ROLES: 'homecare-roles-channel',
    USERS: 'homecare-users-channel',
    PATIENTS: 'homecare-patients-channel',
  } satisfies Record<ChannelKey, string>,
} as const;

interface MenuItem {
  label: string;
  icon: string;
  types?: string[];        // Tipos de profissional autorizados (opcional)
  permissions?: string[];  // Permissões de acesso autorizadas (opcional)
  routerLink?: string[];
  action?: () => void;
}

interface MenuGroup {
  subHeader: string;
  requiredTypes?: string[];       // Tipos exigidos para o grupo
  requiredPermissions?: string[]; // Permissões exigidas para o grupo
  items: MenuItem[];
}

@Component({
  selector: 'app-homecare-layout',
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    RouterModule,
    MatMenuModule,
    MatDialogModule,
  ],
  templateUrl: './homecare.layout.html',
  styleUrl: './homecare.layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomecareLayout implements OnInit, OnDestroy {
  // 🔒 Injeções de dependência
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  // Captura opcional do input HTML (evita crash caso não exista no template)
  protected readonly competence = viewChild<ElementRef>('competence');

  // 📡 Mapa de instâncias dos BroadcastChannels do módulo
  private readonly channels = new Map<ChannelKey, BroadcastChannel>();

  // ==========================================
  // REATIVIDADE VIA SIGNALS
  // ==========================================

  /**
   * 1. Reage dinamicamente a alterações no usuário logado dentro do AuthService
   */
  protected readonly currentUser = computed(() => this.authService.currentUser() as User | null);

  /**
   * 2. Extrai os tipos de profissional normalizados em lowercase
   */
  protected readonly userProfessionalTypes = computed<string[]>(() => {
    const professional = this.currentUser()?.professional as Record<string, unknown> | undefined;
    if (!professional) return [];

    const rawTypes = professional['types'] ?? professional['type'] ?? [];
    const typesList = Array.isArray(rawTypes) ? rawTypes : [rawTypes];

    return typesList
      .map((item: unknown) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return (obj['type'] ?? obj['name'] ?? obj['description'] ?? '') as string;
        }
        return '';
      })
      .map((type) => type.trim().toLowerCase())
      .filter(Boolean);
  });

  /**
   * 3. Extrai e memoriza as permissões do usuário em um Set (O(1) nas consultas do menu)
   */
  protected readonly userPermissions = computed<Set<string>>(() => {
    const roles = this.currentUser()?.roles || [];
    return new Set<string>(
      roles
        .flatMap((role) => role.permissions || [])
        .map((p) => p.name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))
    );
  });

  /**
   * 4. Filtra automaticamente grupos e itens autorizados (pode ser usado direto no @for do HTML)
   */
  protected readonly visibleMenuGroups = computed<MenuGroup[]>(() => {
    // Lê os signals para registrar dependência reativa
    this.userProfessionalTypes();
    this.userPermissions();

    return this.menuGroups
      .filter((group) => this.hasAccess(group.requiredTypes, group.requiredPermissions))
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => this.hasAccess(item.types, item.permissions)),
      }))
      .filter((group) => group.items.length > 0);
  });

  // ==========================================
  // Ciclo de Vida (BroadcastChannels)
  // ==========================================

  ngOnInit(): void {
    (Object.keys(LAYOUT_CONFIG.channels) as ChannelKey[]).forEach((key) => {
      this.channels.set(key, new BroadcastChannel(LAYOUT_CONFIG.channels[key]));
    });
  }

  ngOnDestroy(): void {
    this.channels.forEach((channel) => channel.close());
    this.channels.clear();
  }

  public postMessage(channelKey: ChannelKey, message: unknown = 'update'): void {
    const channel = this.channels.get(channelKey);
    if (channel) {
      channel.postMessage(message);
    }
  }

  // ==========================================
  // Métodos de Verificação de Acesso
  // ==========================================

  protected checkProfessionalType(allowedTypes?: string[]): boolean {
    if (!allowedTypes || allowedTypes.length === 0) return true;

    const currentTypes = this.userProfessionalTypes();
    return allowedTypes.some((type) => currentTypes.includes(type.trim().toLowerCase()));
  }

  protected checkPermission(names?: string[]): boolean {
    if (!names || names.length === 0) return true;

    const permissions = this.userPermissions();
    if (permissions.size === 0) return false;

    const modulePrefix =
      this.route.snapshot.routeConfig?.path ||
      this.route.parent?.snapshot.routeConfig?.path ||
      LAYOUT_CONFIG.moduleSlug;

    return names.some((name) => {
      const target = name.trim().toLowerCase();
      return permissions.has(`${modulePrefix}/${target}`) || permissions.has(target);
    });
  }

  protected hasAccess(types?: string[], permissions?: string[]): boolean {
    return this.checkProfessionalType(types) && this.checkPermission(permissions);
  }

  private openDialog(component: any, width = '500px', height = 'auto', channelKey?: ChannelKey): void {
    this.dialog
      .open(component, {
        width,
        height,
        disableClose: true,
        autoFocus: false,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result && channelKey) {
          this.postMessage(channelKey, 'update');
        }
      });
  }

  // ==========================================
  // MENU DO TEMPLATE HTML
  // ==========================================
  protected readonly menuGroups: MenuGroup[] = [
    {
      subHeader: 'Usuários',
      requiredTypes: [Professionals.ADMINISTRADOR],
      requiredPermissions: ['usuário listar', 'usuário criar'],
      items: [
        {
          label: 'Usuários',
          icon: 'groups',
          types: [Professionals.ADMINISTRADOR],
          permissions: ['usuário listar'],
          routerLink: ['usuarios'],
        },
        {
          label: 'Novo usuário',
          icon: 'person_add',
          types: [Professionals.ADMINISTRADOR],
          permissions: ['usuário criar'],
          action: () => this.userCreate(),
        },
      ],
    },
    {
      subHeader: 'Regras',
      requiredTypes: [Professionals.ADMINISTRADOR],
      requiredPermissions: ['regra listar', 'regra criar'],
      items: [
        {
          label: 'Regras',
          icon: 'security',
          types: [Professionals.ADMINISTRADOR],
          permissions: ['regra listar'],
          routerLink: ['regras'],
        },
        {
          label: 'Nova regra',
          icon: 'add_moderator',
          types: [Professionals.ADMINISTRADOR],
          permissions: ['regra criar'],
          action: () => this.roleCreate(),
        },
      ],
    },
    {
      subHeader: 'Pacientes',
      requiredTypes: [Professionals.CADASTRO],
      requiredPermissions: ['paciente listar', 'paciente criar'],
      items: [
        {
          label: 'Pacientes',
          icon: 'personal_injury',
          types: [Professionals.CADASTRO],
          permissions: ['paciente listar'],
          routerLink: ['pacientes'],
        },
        {
          label: 'Novo paciente',
          icon: 'person_add',
          types: [Professionals.CADASTRO],
          permissions: ['paciente criar'],
          action: () => this.patientCreate(),
        },
        {
          label: 'Arquivo',
          icon: 'inventory_2',
          types: [Professionals.CADASTRO],
          permissions: ['paciente listar'],
          routerLink: ['arquivo-pacientes'],
        },
      ],
    },
  ];

  // --- MÉTODOS DE AÇÃO DO TEMPLATE HTML ---
  protected userCreate(): void {
    this.openDialog(UserCreateComponent, '700px', 'auto', 'USERS');
  }

  protected roleCreate(): void {
    this.openDialog(RoleCreateComponent, '900px', 'auto', 'ROLES');
  }

  protected patientCreate(): void {
    this.openDialog(PatientCreateComponent, '1200px', '700px', 'PATIENTS');
  }
}