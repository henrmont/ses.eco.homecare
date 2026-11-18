import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { NgxMaskPipe, provideNgxMask } from 'ngx-mask';

// Angular CDK & Material
import { Overlay } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

// Core & Models (Padrão alias "as User")
import { LoadingComponent } from '../../../core/components/loading-component/loading-component';
import { PatientCare } from '../../models/patient-care.model';
import { Patient } from '../../models/patient.model';
import { Permission } from '../../../core/models/permission.model';
import { Role } from '../../../core/models/role.model';
import { HomecareUser as User } from '../../models/user.model';
import { PatientService } from '../../services/patient.service';
import { AuthService } from '../../services/auth.service';

// Dialog Components
import { PatientDetailComponent } from '../../components/patients/patient-detail/patient-detail.component';
import { PatientMoveFromArchiveComponent } from '../../components/patients/patient-move-from-archive/patient-move-from-archive.component';
import { PatientRequirementComponent } from '../../components/patients/patient-requirement/patient-requirement.component';

// ============================================================================
// CONFIGURAÇÃO DO MÓDULO (Único bloco a ajustar ao replicar para outro módulo)
// ============================================================================
const PAGE_CONFIG = {
  channelName: 'homecare-patients-channel',
  permissionPrefix: 'homecare/',
} as const;

// Estrutura dos dados para exibição da tabela de arquivados
interface ArchivePatientTableRow extends PatientCare {
  name: string;
  cns: string;
  document: string;
  document_type: string;
  responsible: string;
}

type PatientDialogData = {
  patient?: Patient;
  patient_care?: PatientCare;
};

@Component({
  selector: 'app-archive-patients-page',
  standalone: true,
  imports: [
    MatBadgeModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    NgxMaskPipe,
  ],
  providers: [provideNgxMask()],
  templateUrl: './archive-patients.page.html',
  styleUrl: './archive-patients.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchivePatientsPage implements OnInit, OnDestroy {
  // ==========================================
  // Instância própria do canal
  // ==========================================
  private readonly patientsChannel = new BroadcastChannel(PAGE_CONFIG.channelName);

  // ==========================================
  // Injeção de Dependências
  // ==========================================
  private readonly patientService = inject(PatientService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly overlay = inject(Overlay);
  private readonly destroyRef = inject(DestroyRef);

  // ==========================================
  // ViewChildren / Elementos da View
  // ==========================================
  private readonly archiveSort = viewChild<MatSort>('archiveSort');
  private readonly archivePaginator = viewChild<MatPaginator>('archivePaginator');

  // ==========================================
  // Propriedades e Estado Reativo
  // ==========================================
  private loadingDialog?: MatDialogRef<LoadingComponent>;
  private readonly currentUser = computed(() => this.authService.currentUser() as User | null);

  private readonly userPermissions = computed<Set<string>>(() => {
    const roles = this.currentUser()?.roles || [];
    return new Set<string>(
      roles
        .flatMap((role: Role) => role.permissions || [])
        .map((perm: Permission) => perm.name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name))
    );
  });

  protected readonly displayedColumns: string[] = [
    'name',
    'cns',
    'document',
    'responsible',
    'status',
    'actions',
  ];
  protected readonly archivedDataSource = new MatTableDataSource<ArchivePatientTableRow>([]);

  constructor() {
    effect(() => {
      const archiveSort = this.archiveSort();
      const archivePaginator = this.archivePaginator();

      if (archiveSort) this.archivedDataSource.sort = archiveSort;
      if (archivePaginator) this.archivedDataSource.paginator = archivePaginator;
    });
  }

  // ==========================================
  // Ciclo de Vida (Hooks)
  // ==========================================
  ngOnInit(): void {
    this.fetchArchivePatients(true);
    this.listenToBroadcastChannel();
  }

  ngOnDestroy(): void {
    this.patientsChannel.close();
  }

  // ==========================================
  // Métodos Acessíveis pelo Template (Protected)
  // ==========================================
  protected applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.archivedDataSource.filter = filterValue.trim().toLowerCase();

    if (this.archivedDataSource.paginator) {
      this.archivedDataSource.paginator.firstPage();
    }
  }

  /**
   * Retorna `true` quando o botão deve ficar DESABILITADO (`[disabled]="checkPermissions('...')"`)
   */
  protected checkPermissions(permissionName: string): boolean {
    const permissions = this.userPermissions();
    if (permissions.size === 0) return true;

    const target = permissionName.trim().toLowerCase();
    const hasPermission =
      permissions.has(target) ||
      permissions.has(`${PAGE_CONFIG.permissionPrefix}${target}`);

    return !hasPermission;
  }

  // Ações disparadas pelos botões da tabela
  protected patientDetail(patientCare: PatientCare): void {
    this.openDialog(PatientDetailComponent, { patient_care: patientCare }, '1200px', '700px', false);
  }

  protected patientMoveFromArchive(patientCare: PatientCare): void {
    this.openDialog(PatientMoveFromArchiveComponent, { patient_care: patientCare }, '400px');
  }

  protected patientRequirement(patientCare: PatientCare): void {
    this.openDialog(PatientRequirementComponent, { patient_care: patientCare }, '500px');
  }

  // ==========================================
  // Métodos Privados / Auxiliares
  // ==========================================
  private fetchArchivePatients(showLoading = false): void {
    if (showLoading) this.openLoading();

    this.patientService
      .getArchivePatients()
      .pipe(
        finalize(() => {
          if (showLoading && this.loadingDialog) {
            this.loadingDialog.close();
          }
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response: PatientCare[]) => {
          const rawData = response || [];
          this.archivedDataSource.data = rawData.map((item) => this.mapArchivedPatientRow(item));
        },
        error: () => {
          this.archivedDataSource.data = [];
        },
      });
  }

  private listenToBroadcastChannel(): void {
    this.patientsChannel.onmessage = (message: MessageEvent<string>) => {
      if (message.data === 'update') {
        this.fetchArchivePatients(false);
      }
    };
  }

  private mapArchivedPatientRow(item: PatientCare): ArchivePatientTableRow {
    return {
      ...item,
      name: item.patient?.name || '-',
      cns: item.patient?.cns || '-',
      document: item.patient?.document || '-',
      document_type: item.patient?.document_type || '-',
      responsible: item.user?.professional?.name || '-',
    };
  }

  private openLoading(): void {
    this.loadingDialog = this.dialog.open(LoadingComponent, {
      height: '200px',
      disableClose: true,
      autoFocus: false,
    });
  }

  private openDialog<T>(
    component: ComponentType<T>,
    data: PatientDialogData,
    width = '1200px',
    height = 'auto',
    requiresRefresh = true
  ): void {
    this.dialog
      .open(component, {
        width,
        height,
        disableClose: true,
        autoFocus: false,
        scrollStrategy: this.overlay.scrollStrategies.noop(),
        data,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (result && requiresRefresh) {
          this.handlePatientChange();
        }
      });
  }

  private handlePatientChange(): void {
    this.fetchArchivePatients(false);
    this.patientsChannel.postMessage('update');
  }
}