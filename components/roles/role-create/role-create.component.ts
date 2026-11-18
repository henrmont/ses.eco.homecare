import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

// Core & Models
import { MessageService } from '../../../../core/services/message-service';
import { CustomValidators } from '../../../../core/validators/custom.validator';
import { Permission } from '../../../../core/models/permission.model';
import { RoleService } from '../../../services/role.service';

interface PermissionGroup {
  label: string;
  icon: string;
  filter: string;
  items: Permission[];
}

const PERMISSION_GROUPS_CONFIG = [
  { label: 'USUÁRIOS', icon: 'people', filter: 'usuário' },
  { label: 'REGRAS', icon: 'security', filter: 'regra' },
  { label: 'PACIENTES', icon: 'personal_injury', filter: 'paciente' },
] as const;

@Component({
  selector: 'app-role-create',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
  ],
  templateUrl: './role-create.component.html',
  styleUrl: './role-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleCreateComponent implements OnInit {
  // ==========================================
  // Injeção de Dependências
  // ==========================================
  private readonly fb = inject(FormBuilder);
  private readonly roleService = inject(RoleService);
  private readonly messageService = inject(MessageService);
  private readonly dialogRef = inject(MatDialogRef<RoleCreateComponent>);
  private readonly destroyRef = inject(DestroyRef);

  // ==========================================
  // Propriedades e Estado Reativo
  // ==========================================
  protected roleForm!: FormGroup;

  protected readonly isLoading = signal<boolean>(true);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly permissions = signal<Permission[]>([]);

  protected readonly groupedPermissions = computed<PermissionGroup[]>(() => {
    const allPermissions = this.permissions();

    return PERMISSION_GROUPS_CONFIG.map((group) => ({
      ...group,
      items: allPermissions.filter(
        (permission) =>
          this.extractResourceName(permission.name) === group.filter.toLowerCase()
      ),
    }));
  });

  protected readonly errorMessages: Record<string, Array<{ type: string; message: string }>> = {
    name: [{ type: 'required', message: 'O nome da regra é obrigatório.' }],
    permissions: [
      { type: 'invalidPermissions', message: 'Selecione as permissões válidas para esta regra.' },
    ],
  };

  constructor() {
    effect(() => {
      if (!this.roleForm) return;

      if (this.isSubmitting()) {
        this.roleForm.disable({ emitEvent: false });
      } else {
        this.roleForm.enable({ emitEvent: false });
      }
    });
  }

  // ==========================================
  // Getters Utilitários
  // ==========================================
  protected get selectedPermissions(): number[] {
    return this.roleForm?.get('permissions')?.value || [];
  }

  // ==========================================
  // Ciclo de Vida (Hooks)
  // ==========================================
  ngOnInit(): void {
    this.initForm();
    this.fetchPermissions();
  }

  // ==========================================
  // Métodos Acessíveis pelo Template
  // ==========================================
  protected isPermissionSelected(id?: number): boolean {
    if (!id) return false;
    return this.selectedPermissions.includes(id);
  }

  protected formatPermissionName(name?: string): string {
    if (!name) return '';
    return name.split('/').pop() || name;
  }

  protected togglePermission(item: Permission): void {
    if (!item.id || this.isSubmitting() || this.roleForm.disabled) return;

    const permissionsControl = this.roleForm.get('permissions');
    if (!permissionsControl) return;

    const currentPermissions: number[] = Array.isArray(permissionsControl.value)
      ? [...permissionsControl.value]
      : [];

    const index = currentPermissions.indexOf(item.id);

    if (index !== -1) {
      currentPermissions.splice(index, 1);
    } else {
      currentPermissions.push(item.id);
    }

    permissionsControl.setValue(currentPermissions);
    permissionsControl.markAsDirty();
    permissionsControl.updateValueAndValidity();
  }

  protected onSubmit(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.roleService
      .createRole(this.roleForm.getRawValue())
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.messageService.showMessage(response?.message || 'Regra criada com sucesso!');
          this.dialogRef.close(true);
        },
        error: (err) => {
          const fallbackError = 'Erro ao criar a regra.';
          this.messageService.showMessage(err?.error?.message || fallbackError);
        },
      });
  }

  // ==========================================
  // Métodos Privados
  // ==========================================
  private initForm(): void {
    this.roleForm = this.fb.group({
      name: ['', [Validators.required]],
      permissions: [[], [CustomValidators.permissionsValidator()]],
    });
  }

  private fetchPermissions(): void {
    this.roleService
      .getPermissions()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          this.permissions.set(response || []);
        },
        error: (err) => {
          const fallbackError = 'Erro ao carregar lista de permissões.';
          this.messageService.showMessage(err?.error?.message || fallbackError);
        },
      });
  }

  private extractResourceName(permissionName?: string): string {
    if (!permissionName) return '';
    const unprefixed = permissionName.split('/').pop()?.trim() || '';
    const lastSpaceIndex = unprefixed.lastIndexOf(' ');

    return (
      lastSpaceIndex !== -1 ? unprefixed.substring(0, lastSpaceIndex) : unprefixed
    )
      .trim()
      .toLowerCase();
  }
}