import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

// Angular Material
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { NgxMaskPipe } from 'ngx-mask';

// Models (Padrão alias "as User")
import { ProfessionalType } from '../../../models/professional-type.model';
import { HomecareUser as User } from '../../../models/user.model';

export type UserDetailDialogData = {
  user?: User;
};

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    NgxMaskPipe,
  ],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserDetailComponent {
  // ==========================================
  // Injeção de Dependências e Dados
  // ==========================================
  protected readonly data = inject<UserDetailDialogData | null>(MAT_DIALOG_DATA, { optional: true });

  // ==========================================
  // Estado Derivado (Computed)
  // ==========================================
  protected readonly user = computed(() => this.data?.user);

  protected readonly professional = computed(() => this.user()?.professional);

  protected readonly professionalTypes = computed<string[]>(() => {
    const rawTypes = this.professional()?.types;
    if (!rawTypes || !Array.isArray(rawTypes)) return [];

    return rawTypes.map((t: ProfessionalType | string) => (typeof t === 'string' ? t : t.type));
  });
}